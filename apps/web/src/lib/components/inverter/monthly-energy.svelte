<script lang="ts">
	import { BarChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import RangeSwitcher from '$lib/components/inverter/range-switcher.svelte';
	import { api } from '$lib/api';

	// One calendar month of energy, split for the two stacked bars. Mirrors the
	// server's MonthEnergy (apps/server/src/energy-calc.ts).
	type Month = {
		month: string;
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

	let months = $state<Month[]>([]);
	let loading = $state(true);

	// The two stacks are read the same way whether shown as absolute kWh or as a
	// 100%-normalized share — only the LayerChart series layout changes.
	const LAYOUTS = [
		{ id: 'kwh', label: 'kWh' },
		{ id: 'percent', label: '% share' }
	] as const;
	let layoutId = $state<(typeof LAYOUTS)[number]['id']>('kwh');
	const seriesLayout = $derived(layoutId === 'percent' ? 'stackExpand' : 'stack');

	// Fixed trailing 12-month window, independent of the page's range switcher.
	$effect(() => {
		let cancelled = false;
		loading = true;
		api.api.energy.monthly.get({ query: { months: 12 } }).then(({ data }) => {
			if (cancelled) return;
			months = (data ?? []) as Month[];
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	// A trailing 12-month window has each calendar month exactly once, so a short
	// month name is a unique, readable band label.
	const monthLabel = (key: string) => {
		const d = new Date(`${key}-01T00:00:00`);
		return Number.isNaN(d.getTime())
			? key
			: d.toLocaleDateString(undefined, { month: 'short' });
	};
	const data = $derived(months.map((m) => ({ ...m, label: monthLabel(m.month) })));
	const hasData = $derived(months.some((m) => m.loadKwh > 0 || m.productionKwh > 0));

	// Window-average ratio (mean over months that have the relevant flow), shown
	// as a caption so the charts tie back to the headline tiles above.
	const avg = (vals: (number | null)[]) => {
		const present = vals.filter((v): v is number => v !== null);
		return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
	};
	const avgSelfSufficiency = $derived(avg(months.map((m) => m.selfSufficiency)));
	const avgSelfConsumption = $derived(avg(months.map((m) => m.selfConsumption)));
	const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

	type Series = { key: string; label: string; color: string; value: (d: Month) => number };

	const consumptionSeries: Series[] = [
		{
			key: 'grid',
			label: 'From grid',
			color: 'var(--color-energy-grid)',
			value: (d) => d.gridToLoadKwh
		},
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
		{
			key: 'export',
			label: 'Exported',
			color: 'var(--color-energy-export)',
			value: (d) => d.exportedKwh
		}
	];

	const configOf = (series: Series[]): Chart.ChartConfig =>
		Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
</script>

{#snippet chart(title: string, subtitle: string, series: Series[], ratio: number | null)}
	<div class="flex flex-col gap-3">
		<div class="flex items-baseline justify-between gap-3">
			<div class="flex flex-col">
				<h3 class="text-sm font-medium">{title}</h3>
				<span class="text-xs text-muted-foreground">{subtitle}</span>
			</div>
			<span class="text-sm tabular-nums text-muted-foreground">
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
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</BarChart>
		</Chart.Container>
		<!-- Legend keeps identity off color-alone (dataviz accessibility pass). -->
		<div class="flex flex-wrap gap-x-4 gap-y-1">
			{#each series as s (s.key)}
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span class="size-2.5 rounded-xs" style="background: {s.color}"></span>
					{s.label}
				</span>
			{/each}
		</div>
	</div>
{/snippet}

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
			Last 12 months
		</h2>
		<RangeSwitcher options={LAYOUTS} bind:value={layoutId} />
	</div>

	{#if loading && months.length === 0}
		<div class="grid gap-6 lg:grid-cols-2">
			<Skeleton class="h-65 w-full" />
			<Skeleton class="h-65 w-full" />
		</div>
	{:else if !hasData}
		<p class="text-sm text-muted-foreground">
			No monthly energy yet — this fills in as daily rollups accumulate.
		</p>
	{:else}
		<div class="grid gap-8 lg:grid-cols-2">
			{@render chart(
				'Consumption',
				'Where your energy came from (self-sufficiency)',
				consumptionSeries,
				avgSelfSufficiency
			)}
			{@render chart(
				'Production',
				'Where your solar went (self-consumption)',
				productionSeries,
				avgSelfConsumption
			)}
		</div>
	{/if}
</div>
