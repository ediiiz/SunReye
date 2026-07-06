<script lang="ts">
	import { BarChart } from 'layerchart';
	import { fade } from 'svelte/transition';
	import * as Chart from '$lib/components/ui/chart';
	import ChartLegend from '$lib/components/inverter/chart-legend.svelte';
	import RangeSwitcher from '$lib/components/inverter/range-switcher.svelte';
	import { api } from '$lib/api';
	import { COST_X_TICKS, periodLabel, type CostBucket, type CostRange } from '$lib/cost/ranges';

	// One period of energy, split for the two stacked bars. Mirrors the server's
	// PeriodEnergy (apps/server/src/energy-calc.ts).
	type Period = {
		bucket: string;
		importKwh: number;
		exportKwh: number;
		loadKwh: number;
		productionKwh: number;
		gridToLoadKwh: number;
		solarToLoadKwh: number;
		selfConsumedKwh: number;
		exportedKwh: number;
		selfSufficiency: number | null;
		selfConsumption: number | null;
	};

	// Follows the page's range picker: same window/granularity as the net-cost chart.
	let { chart, caption }: { chart: CostRange['chart']; caption: string } = $props();

	// Periods + the granularity they were fetched at, updated together so labels
	// never mix stale periods with a freshly-picked bucket.
	let view = $state<{ periods: Period[]; bucket: CostBucket }>({ periods: [], bucket: 'day' });
	const periods = $derived(view.periods);
	let loading = $state(true);

	// The two stacks are read the same way whether shown as absolute kWh or as a
	// 100%-normalized share — only the LayerChart series layout changes.
	const LAYOUTS = [
		{ id: 'kwh', label: 'kWh' },
		{ id: 'percent', label: '% share' }
	] as const;
	let layoutId = $state<(typeof LAYOUTS)[number]['id']>('kwh');
	const seriesLayout = $derived(layoutId === 'percent' ? 'stackExpand' : 'stack');

	$effect(() => {
		const query = {
			from: chart.from.toISOString(),
			to: chart.to.toISOString(),
			bucket: chart.bucket
		};
		let cancelled = false;
		loading = true;
		api.api.energy.series.get({ query }).then(({ data }) => {
			if (cancelled) return;
			view = { periods: (data ?? []) as Period[], bucket: chart.bucket };
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	const data = $derived(periods.map((p) => ({ ...p, label: periodLabel(p.bucket, view.bucket) })));
	const hasData = $derived(periods.some((p) => p.loadKwh > 0 || p.productionKwh > 0));

	// Window-average ratio (mean over periods that have the relevant flow), shown
	// as a caption so the charts tie back to the headline tiles above.
	const avg = (vals: (number | null)[]) => {
		const present = vals.filter((v): v is number => v !== null);
		return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
	};
	const avgSelfSufficiency = $derived(avg(periods.map((m) => m.selfSufficiency)));
	const avgSelfConsumption = $derived(avg(periods.map((m) => m.selfConsumption)));
	const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

	type Series = { key: string; label: string; color: string; value: (d: Period) => number };

	const consumptionSeries: Series[] = [
		{ key: 'grid', label: 'From grid', color: 'var(--color-energy-grid)', value: (d) => d.gridToLoadKwh },
		{
			key: 'solar',
			label: 'From solar / battery',
			color: 'var(--color-energy-solar)',
			value: (d) => d.solarToLoadKwh
		}
	];
	const productionSeries: Series[] = [
		{
			key: 'selfused',
			label: 'Used on-site',
			color: 'var(--color-energy-selfused)',
			value: (d) => d.selfConsumedKwh
		},
		{ key: 'export', label: 'Exported', color: 'var(--color-energy-export)', value: (d) => d.exportedKwh }
	];

	const configOf = (series: Series[]): Chart.ChartConfig =>
		Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
</script>

{#snippet chartBlock(title: string, subtitle: string, series: Series[], ratio: number | null)}
	<!-- min-w-0 lets the grid column shrink below the chart's intrinsic width;
	     without it the block overflows the section edge on narrow screens. -->
	<div class="flex min-w-0 flex-col gap-3">
		<div class="flex items-baseline justify-between gap-3">
			<div class="flex flex-col">
				<h3 class="text-sm font-medium">{title}</h3>
				<span class="text-xs text-muted-foreground">{subtitle}</span>
			</div>
			<span class="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">
				avg <span class="font-semibold text-foreground">{pct(ratio)}</span>
			</span>
		</div>
		<Chart.Container config={configOf(series)} class="h-55 w-full">
			<BarChart
				{data}
				x="label"
				{series}
				{seriesLayout}
				bandPadding={0.25}
				stackPadding={2}
				padding={{ top: 8, right: 8, bottom: 20, left: 44 }}
				props={{ xAxis: { ticks: COST_X_TICKS[view.bucket] } }}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
		<ChartLegend items={series} />
	</div>
{/snippet}

{#if !loading && hasData}
	<section
		class="flex flex-col gap-4 border border-border p-4"
		transition:fade={{ duration: 200 }}
	>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
				Energy split — {caption}
			</h2>
			<RangeSwitcher options={LAYOUTS} bind:value={layoutId} />
		</div>

		<div class="grid gap-8 lg:grid-cols-2">
			{@render chartBlock(
				'Consumption',
				'Where your energy came from (self-sufficiency)',
				consumptionSeries,
				avgSelfSufficiency
			)}
			{@render chartBlock(
				'Production',
				'Where your solar went (self-consumption)',
				productionSeries,
				avgSelfConsumption
			)}
		</div>
	</section>
{/if}
