<script lang="ts">
	import { AreaChart, Area, ChartClipPath, Highlight } from 'layerchart';
	import { curveCatmullRom } from 'd3-shape';
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { linear } from 'svelte/easing';
	import * as Chart from '$lib/components/ui/chart';

	type Datum = Record<string, number | Date>;

	let {
		data = [],
		series,
		config,
		labelFormatter,
		windowMs = 2 * 60 * 1000
	}: {
		/** Merged rows, one per timestamp: `{ date: Date, [metricKey]: number }`. */
		data?: Datum[];
		/** Overlaid series definitions (key/label/color/value), shared by the chart. */
		series: { key: string; label: string; color: string; value: (d: Datum) => number | null }[];
		config: Chart.ChartConfig;
		labelFormatter: (value: unknown) => string;
		windowMs?: number;
	} = $props();

	// AreaChart's `marks` context isn't exposed in the public types; type just the
	// fields we read so it isn't implicitly `any`.
	type MarksContext = {
		context: {
			xScale: (value: number) => number;
			series: { visibleSeries: { key: string }[] };
		};
	};

	const times = $derived(data.map((d) => (d.date as Date).getTime()));
	const lastT = $derived(times.at(-1));

	// Spacing between samples, clamped, used to size the off-screen buffer below.
	const interval = $derived.by(() => {
		const a = times.at(-1);
		const b = times.at(-2);
		return a !== undefined && b !== undefined ? Math.min(Math.max(a - b, 250), 5000) : 1000;
	});

	// A real-time cursor that drifts continuously toward the newest sample instead of
	// snapping to it once a second. Only the marks' translate (below) reads `cursor` —
	// never `data`/`xDomain` — so the chart itself does NOT re-render per frame. Mirrors
	// live-area.svelte; here the marks group holds every overlaid series.
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

	// Fixed window anchored to the newest sample: `data`/`xDomain` change only when a
	// sample lands (~1 Hz), bounding LayerChart's scale/path/quadtree work to sample
	// cadence. A few intervals of buffer past the left edge keep the glide from
	// revealing empty space; ChartClipPath hides everything outside the window.
	const xDomain = $derived(
		lastT === undefined ? undefined : [new Date(lastT - windowMs), new Date(lastT)]
	);
	const windowed = $derived(
		lastT === undefined ? data : data.filter((d) => (d.date as Date).getTime() >= lastT - windowMs - 6 * interval)
	);

	// Per-frame smooth scroll WITHOUT re-rendering the chart: translate the marks group
	// so the visible right edge tracks the interpolated cursor. Resolves to a
	// compositor-friendly transform on a single <g>. Matches live-area.svelte.
	function glideX(xScale: (t: number) => number): number {
		if (lastT === undefined) return 0;
		return xScale(lastT) - xScale(cursor.current - interval);
	}
</script>

{#snippet clippedMarks({ context }: MarksContext)}
	<ChartClipPath>
		<g transform={`translate(${glideX(context.xScale)}, 0)`}>
			{#each context.series.visibleSeries as s (s.key)}
				<Area
					seriesKey={s.key}
					curve={curveCatmullRom}
					fillOpacity={0.2}
					line={{ 'stroke-width': 1.5 }}
				/>
			{/each}
			<!-- Highlight inside the glide-translated group so the point/crosshair track
			     the visible line (the chart's own highlight sits in untranslated data
			     space, offset by exactly `glideX`). -->
			<Highlight points lines />
		</g>
	</ChartClipPath>
{/snippet}

<Chart.Container
	{config}
	class={[
		'aspect-auto h-full w-full',
		// Feather the plot's horizontal edges so data glides in/out instead of ending on
		// a hard cut. Pinned to layerchart's fixed-size container (not the moving path)
		// so the fade stays put while the series scrolls under it; keeps the ~44px
		// axis-label gutter opaque.
		'[&_.lc-root-container]:mask-(--edge-fade)'
	]}
	style="--edge-fade: linear-gradient(to right, #000 0, #000 42px, transparent 44px, #000 96px, #000 calc(100% - 20px), transparent calc(100% - 6px))"
>
	<!--
		`bisect-x` tooltip mode allocates nothing per sample (binary-search on pointer
		move) vs the default `quadtree-x` rebuilding a quadtree every sample. Same
		nearest-x hover across the overlaid series.
	-->
	<AreaChart
		data={windowed}
		x="date"
		{series}
		{xDomain}
		seriesLayout="overlap"
		axis="y"
		grid
		rule={false}
		legend={false}
		padding={{ top: 8, right: 6, bottom: 6, left: 44 }}
		marks={clippedMarks}
		highlight={false}
		tooltipContext={{ mode: 'bisect-x' }}
	>
		{#snippet tooltip()}
			<Chart.Tooltip {labelFormatter} />
		{/snippet}
	</AreaChart>
</Chart.Container>
