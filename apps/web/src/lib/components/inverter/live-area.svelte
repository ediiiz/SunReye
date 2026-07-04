<script lang="ts">
	import { AreaChart, Area, LinearGradient } from 'layerchart';
	import { curveCatmullRom } from 'd3-shape';
	import * as Chart from '$lib/components/ui/chart';
	import type { LivePoint } from '$lib/inverter/types';

	let {
		points = [],
		accent = 'var(--color-chart-2)',
		diverging = false,
		windowMs = 2 * 60 * 1000,
		height = 'h-40'
	}: {
		points?: LivePoint[];
		accent?: string;
		/** Split the fill red (above 0) / green (below 0) around a zero baseline. */
		diverging?: boolean;
		windowMs?: number;
		/** Tailwind height class for the chart box (fixed height — not h-full). */
		height?: string;
	} = $props();

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
	config={{}}
	class={['aspect-auto w-full', height]}
	style="--color-primary: {accent}"
>
	<AreaChart
		{data}
		x="t"
		{xDomain}
		y="v"
		axis={false}
		grid={false}
		rule={false}
		legend={false}
		tooltipContext={false}
		padding={{ top: 6, bottom: 2, left: 0, right: 0 }}
		props={{ area: { curve: curveCatmullRom } }}
		marks={diverging ? divergingMarks : undefined}
	/>
</Chart.Container>
