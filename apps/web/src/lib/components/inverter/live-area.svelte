<script lang="ts">
	import { AreaChart, Area, LinearGradient } from 'layerchart';
	import { curveCatmullRom } from 'd3-shape';
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

	// Fixed-width scrolling window pinned to the newest sample (see kpi rationale).
	const lastT = $derived(points.at(-1)?.t);
	const data = $derived(
		lastT === undefined ? points : points.filter((p) => p.t >= lastT - windowMs)
	);
	const xDomain = $derived(lastT === undefined ? undefined : [lastT - windowMs, lastT]);
</script>

{#snippet divergingMarks({ context }: MarksContext)}
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
{/snippet}

<Chart.Container
	config={{ v: { label, color: accent } }}
	class={['aspect-auto w-full', height]}
	style="--color-primary: {accent}"
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
		props={{ area: { curve: curveCatmullRom } }}
		marks={diverging ? divergingMarks : undefined}
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
