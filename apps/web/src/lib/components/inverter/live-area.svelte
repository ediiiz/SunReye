<script lang="ts">
	import { AreaChart, Area, LinearGradient, ChartClipPath } from 'layerchart';
	import { curveCatmullRom } from 'd3-shape';
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { linear } from 'svelte/easing';
	import * as Chart from '$lib/components/ui/chart';
	import { fractionDigits } from '$lib/inverter/format';
	import type { LivePoint } from '$lib/inverter/types';

	let {
		points = [],
		accent = 'var(--color-chart-2)',
		diverging = false,
		windowMs = 2 * 60 * 1000,
		height = 'h-40',
		label = 'Value',
		unit = ''
	}: {
		points?: LivePoint[];
		accent?: string;
		/** Split the fill red (above 0) / green (below 0) around a zero baseline. */
		diverging?: boolean;
		windowMs?: number;
		/** Tailwind height class for the chart box (fixed height — not h-full). */
		height?: string;
		/** Series name shown in the hover tooltip. */
		label?: string;
		/** Unit suffix appended to the tooltip value. */
		unit?: string;
	} = $props();

	const timeFmt = new Intl.DateTimeFormat(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	// Diverging semantics: above 0 = consumption (red), below 0 = export (green).
	const IMPORT_COLOR = 'oklch(0.63 0.21 25)';
	const EXPORT_COLOR = 'oklch(0.7 0.16 152)';

	// AreaChart's `marks` context isn't exposed in the public types; type just the
	// fields we read so it isn't implicitly `any`.
	type MarksContext = {
		context: {
			yScale: (value: number) => number;
			height: number;
			padding: { bottom: number };
		};
	};

	const lastT = $derived(points.at(-1)?.t);

	// Spacing between samples, clamped, used to size the off-screen buffer below.
	const interval = $derived.by(() => {
		const a = points.at(-1)?.t;
		const b = points.at(-2)?.t;
		return a !== undefined && b !== undefined ? Math.min(Math.max(a - b, 250), 5000) : 1000;
	});

	// A real-time cursor that drifts continuously toward the newest sample instead of
	// snapping to it once a second. Mirrors AnimatedNumber: stretch every transition
	// across the real gap since the previous sample and ease it linearly, so the axis
	// glides rather than updating on a visible once-a-second cadence.
	const cursor = new Tween(untrack(() => lastT) ?? 0);
	let lastAt = performance.now();
	$effect(() => {
		const t = lastT; // track live updates
		if (t === undefined) return;
		const now = performance.now();
		const gap = now - lastAt;
		lastAt = now;
		void cursor.set(t, { duration: Math.min(2000, Math.max(300, gap)), easing: linear });
	});

	// The visible window trails the cursor by one interval, so the newest sample lives
	// in the clipped (off-screen, invisible) buffer to the right and glides smoothly
	// into view as the cursor advances — never popping in at the edge. `data` also keeps
	// a few samples of buffer *past both* the left and right window edges so points are
	// only added/removed while off-screen: the spline stays continuous and neither end
	// twitches. ChartClipPath around the marks hides everything outside the window.
	const right = $derived(lastT === undefined ? undefined : cursor.current - interval);
	const data = $derived(
		right === undefined
			? points
			: points.filter((p) => p.t >= right - windowMs - 4 * interval)
	);
	const xDomain = $derived(right === undefined ? undefined : [right - windowMs, right]);
</script>

{#snippet clippedMarks({ context }: MarksContext)}
	<ChartClipPath>
		{#if diverging}
			{@const zero = context.yScale(0) / (context.height + context.padding.bottom)}
			<LinearGradient
				vertical
				stops={[
					[0, IMPORT_COLOR],
					[zero, IMPORT_COLOR],
					[zero, EXPORT_COLOR],
					[1, EXPORT_COLOR]
				]}
			>
				{#snippet children({ gradient })}
					<Area
						y0={() => 0}
						curve={curveCatmullRom}
						line={{ stroke: gradient, 'stroke-width': 1.5 }}
						fill={gradient}
						fillOpacity={0.25}
					/>
				{/snippet}
			</LinearGradient>
		{:else}
			<Area
				curve={curveCatmullRom}
				line={{ stroke: accent, 'stroke-width': 1.5 }}
				fill={accent}
				fillOpacity={0.3}
			/>
		{/if}
	</ChartClipPath>
{/snippet}

<Chart.Container
	config={{ v: { label, color: accent } }}
	class={[
		'aspect-auto w-full',
		height,
		// Feather the plot's horizontal edges so data glides in/out instead of ending on
		// a hard cut. The mask is pinned to layerchart's fixed-size container (not the
		// moving data path) so the fade stays put while the series scrolls under it. The
		// gradient keeps the left ~44px axis-label gutter opaque and feathers only inside
		// the plot area.
		'[&_.lc-root-container]:mask-(--edge-fade)'
	]}
	style="--color-primary: {accent}; --edge-fade: linear-gradient(to right, #000 0, #000 42px, transparent 44px, #000 96px, #000 calc(100% - 58px), transparent calc(100% - 6px))"
>
	<AreaChart
		{data}
		x="t"
		{xDomain}
		y="v"
		axis="y"
		grid
		rule={false}
		legend={false}
		padding={{ top: 6, bottom: 6, left: 44, right: 6 }}
		marks={clippedMarks}
	>
		{#snippet tooltip()}
			<Chart.Tooltip
				labelFormatter={(value) => timeFmt.format(new Date(Number(value)))}
				formatter={tooltipValue}
			/>
		{/snippet}
	</AreaChart>
</Chart.Container>

{#snippet tooltipValue({ value }: { value: unknown })}
	<span class="text-muted-foreground">{label}</span>
	<span class="ml-auto font-mono font-medium tabular-nums text-foreground">
		{Number(value).toLocaleString(undefined, fractionDigits(unit))}{unit ? ` ${unit}` : ''}
	</span>
{/snippet}
