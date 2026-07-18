<script lang="ts">
	import { AreaChart, LineChart } from 'layerchart';
	import { fade } from 'svelte/transition';
	import { curveCatmullRom } from 'd3-shape';
	import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
	import Trash from 'phosphor-svelte/lib/Trash';
	import { Button } from '$lib/components/ui/button';
	import * as Chart from '$lib/components/ui/chart';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as msg from '$lib/paraglide/messages';
	import ChartLegend from '$lib/components/inverter/chart-legend.svelte';
	import { api } from '$lib/api';
	import { inverter } from '$lib/inverter/store.svelte';
	import { tooltipLabel, xTick } from '$lib/inverter/chart-format';
	import type { ChartType, CustomChart } from '$lib/inverter/custom-charts.svelte';
	import type { HistoryRange } from '$lib/inverter/ranges';
	import type { ManifestMetric } from '$lib/inverter/types';

	let {
		chart,
		range,
		type,
		isAdmin = false,
		onEdit,
		onDelete
	}: {
		chart: CustomChart;
		range: HistoryRange;
		/** Render style, chosen by the page-level toggle (shared by all charts). */
		type: ChartType;
		isAdmin?: boolean;
		onEdit?: () => void;
		onDelete?: () => void;
	} = $props();

	// Resolve saved metric keys against the live manifest (a key can vanish if the
	// profile changed after the chart was saved — surface those as "unavailable").
	const resolved = $derived(
		chart.metrics
			.map((key) => inverter.metrics.find((m) => m.key === key))
			.filter((m): m is ManifestMetric => m !== undefined)
	);
	const missing = $derived(
		chart.metrics.filter((key) => !inverter.metrics.some((m) => m.key === key))
	);

	// Overlaid series, one colour each (cycles the 5 chart accents).
	const colorFor = (i: number) => `var(--color-chart-${(i % 5) + 1})`;
	type Datum = Record<string, number | Date>;
	const series = $derived(
		resolved.map((m, i) => ({
			key: m.key,
			label: m.label,
			color: colorFor(i),
			value: (d: Datum) => (d[m.key] as number | undefined) ?? null
		}))
	);
	const config = $derived(
		Object.fromEntries(
			series.map((s) => [s.key, { label: s.label, color: s.color }])
		) as Chart.ChartConfig
	);
	const legendItems = $derived(series.map((s) => ({ key: s.key, label: s.label, color: s.color })));

	// Merge per-metric point lists into one row per timestamp: { date, [key]: v }.
	function merge(perMetric: { key: string; points: { t: number; v: number }[] }[]): Datum[] {
		const byTime = new Map<number, Datum>();
		for (const { key, points } of perMetric) {
			for (const p of points) {
				let row = byTime.get(p.t);
				if (!row) {
					row = { date: new Date(p.t) };
					byTime.set(p.t, row);
				}
				row[key] = p.v;
			}
		}
		return [...byTime.values()].sort(
			(a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
		);
	}

	// ── Historical mode: one rollup fetch per metric, merged by bucket. ──────────
	type Row = { time: string; avg: number };
	let historical = $state<Datum[]>([]);
	let loading = $state(true);

	$effect(() => {
		if (range.live) return;
		const keys = chart.metrics;
		const query = { from: range.from.toISOString(), to: range.to.toISOString(), bucket: range.bucket };
		let cancelled = false;
		loading = true;
		Promise.all(
			keys.map((metric) =>
				api.api.history.rollup
					.get({ query: { metric, ...query, limit: 12000 } })
					.then(({ data }) => ({
						key: metric,
						points: ((data ?? []) as Row[]).map((r) => ({ t: new Date(r.time).getTime(), v: r.avg }))
					}))
			)
		).then((results) => {
			if (cancelled) return;
			historical = merge(results);
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	// ── Live mode: merge the store's in-memory buffers (shared timestamps). ──────
	const live = $derived.by(() =>
		range.live
			? merge(chart.metrics.map((key) => ({ key, points: inverter.series(key) })))
			: []
	);

	const chartData = $derived(range.live ? live : historical);

	// Pin the x-axis to the whole selected window so a partial day (e.g. "Today"
	// before the day is over) still spans the full range instead of stretching to
	// fit only the data present. Live stays auto-fit (gliding buffer).
	const xDomain = $derived(range.live ? undefined : [range.from, range.to]);

	// Axis + tooltip formatting, honouring the configured time zone / clock format.
	const labelFmt = (v: unknown) => tooltipLabel(range, v);
	const xTickFormat = (v: unknown) => xTick(range, v);
</script>

<section class="flex flex-col gap-3 border border-border p-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h3 class="truncate text-sm font-medium">{chart.name}</h3>
		{#if isAdmin}
			<div class="flex items-center gap-1">
				<Button variant="ghost" size="icon" aria-label={msg.chart_edit_chart()} onclick={() => onEdit?.()}>
					<PencilSimple class="size-4" />
				</Button>
				<Button variant="ghost" size="icon" aria-label={msg.chart_delete_chart()} onclick={() => onDelete?.()}>
					<Trash class="size-4" />
				</Button>
			</div>
		{/if}
	</div>

	<div class="h-64 w-full">
		{#if resolved.length === 0}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				{msg.chart_none_available()}
			</div>
		{:else if !range.live && loading}
			<Skeleton class="h-full w-full" />
		{:else if chartData.length === 0}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				{msg.chart_no_data()}
			</div>
		{:else}
			<div class="h-full w-full" in:fade={{ duration: 300 }}>
				<Chart.Container {config} class="aspect-auto h-full w-full">
					{#if type === 'line'}
						<LineChart
							data={chartData}
							x="date"
							{series}
							{xDomain}
							axis
							grid
							padding={{ top: 8, right: 8, bottom: 28, left: 44 }}
							props={{ spline: { curve: curveCatmullRom }, xAxis: { format: xTickFormat, ticks: 4 } }}
						>
							{#snippet tooltip()}
								<Chart.Tooltip labelFormatter={labelFmt} />
							{/snippet}
						</LineChart>
					{:else}
						<AreaChart
							data={chartData}
							x="date"
							{series}
							{xDomain}
							seriesLayout="overlap"
							axis
							grid
							padding={{ top: 8, right: 8, bottom: 28, left: 44 }}
							props={{
								area: { curve: curveCatmullRom, fillOpacity: 0.2, line: { 'stroke-width': 1.5 } },
								xAxis: { format: xTickFormat, ticks: 4 }
							}}
						>
							{#snippet tooltip()}
								<Chart.Tooltip labelFormatter={labelFmt} />
							{/snippet}
						</AreaChart>
					{/if}
				</Chart.Container>
			</div>
		{/if}
	</div>

	<ChartLegend items={legendItems} />

	{#if missing.length > 0}
		<p class="text-xs text-muted-foreground">
			{missing.length === 1
				? msg.chart_metrics_unavailable_one({ count: missing.length })
				: msg.chart_metrics_unavailable_other({ count: missing.length })}
		</p>
	{/if}
</section>
