<script lang="ts">
	import { fade } from 'svelte/transition';
	import Info from 'phosphor-svelte/lib/Info';
	import { api } from '$lib/api';
	import * as Popover from '$lib/components/ui/popover';
	import CostRangePicker from '$lib/components/inverter/cost-range-picker.svelte';
	import CostBarChart from '$lib/components/inverter/cost-bar-chart.svelte';
	import EnergySplitChart from '$lib/components/inverter/energy-split-chart.svelte';
	import { resolveCostPreset, type CostBucket, type CostRange } from '$lib/cost/ranges';

	type Cost = {
		currency: string;
		importKwh: number;
		exportKwh: number;
		importCost: number;
		exportEarnings: number;
		standingCharge: number;
		net: number;
		gridOnlyCost: number;
		savings: number;
		solarSavings: number;
		selfConsumedKwh: number;
		selfSufficiency: number | null;
		selfConsumption: number | null;
		byBand: { name: string; importKwh: number; cost: number }[];
	};

	// One bar of the contextual chart. Mirrors the server's CostSeriesPoint.
	type SeriesPoint = {
		bucket: string;
		importCost: number;
		exportEarnings: number;
		standingCharge: number;
		net: number;
	};

	let range = $state<CostRange>(resolveCostPreset('month'));
	let cost = $state<Cost | null>(null);
	let loading = $state(true);
	// Points + the granularity they were fetched at, updated together so the
	// chart never labels stale points with a freshly-picked bucket.
	let series = $state<{ points: SeriesPoint[]; bucket: CostBucket }>({
		points: [],
		bucket: 'day'
	});

	// Headline tiles: priced over the picked [from, to). `cancelled` guards against
	// an earlier request resolving after a later one and clobbering fresher data.
	$effect(() => {
		const from = range.from.toISOString();
		const to = range.to.toISOString();
		let cancelled = false;
		loading = true;
		api.api.cost.get({ query: { from, to } }).then(({ data }) => {
			if (cancelled) return;
			cost = (data as Cost) ?? null;
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	// Contextual bar chart: its own "one level up" window/granularity (range.chart),
	// e.g. a single month charts the trailing 12 months.
	$effect(() => {
		const spec = range.chart;
		const query = { from: spec.from.toISOString(), to: spec.to.toISOString(), bucket: spec.bucket };
		let cancelled = false;
		api.api.cost.series.get({ query }).then(({ data }) => {
			if (cancelled) return;
			series = { points: (data ?? []) as SeriesPoint[], bucket: spec.bucket };
		});
		return () => {
			cancelled = true;
		};
	});

	// Hide the cost chart entirely when every period is zero (no spend, no earnings,
	// no standing) — matches the "don't render empty components" rule. Checked per
	// component so a period where earnings exactly cancel costs (net 0) still shows.
	const costHasData = $derived(
		series.points.some((p) => p.importCost !== 0 || p.exportEarnings !== 0 || p.net !== 0)
	);

	const money = (v: number) =>
		new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: cost?.currency ?? 'EUR'
		}).format(v);
	const kwh = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`;
	const price = (v: number) =>
		new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: cost?.currency ?? 'EUR',
			minimumFractionDigits: 2,
			maximumFractionDigits: 3
		}).format(v);

	// Solar Saving breakdown: self-consumed kWh × effective grid price = saving.
	// The effective price is the saving spread over the self-consumed energy, so
	// it stays band-accurate without the server returning a separate price.
	const solarSavingBreakdown = $derived.by(() => {
		if (!cost || cost.selfConsumedKwh <= 0) return null;
		return `${kwh(cost.selfConsumedKwh)} × ${price(cost.solarSavings / cost.selfConsumedKwh)}`;
	});
</script>

<div class="flex w-full flex-col gap-6 p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-lg font-semibold">Costs</h1>
			<p class="text-sm text-muted-foreground">Energy priced with your tariff.</p>
		</div>
		<CostRangePicker bind:range />
	</div>

	{#if loading && !cost}
		<div class="flex h-40 items-center justify-center border border-border text-sm text-muted-foreground">
			Loading costs…
		</div>
	{:else if cost}
		{@const c = cost}
		<!-- Headline tiles -->
		<div
			class="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3"
			transition:fade={{ duration: 200 }}
		>
			{#snippet tile(t: {
				label: string;
				value: string;
				sub?: string;
				accent?: string;
				explain: string;
			})}
				<div class="flex flex-col gap-1 bg-background px-4 py-3">
					<div class="flex items-center gap-1.5">
						<span
							class="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground"
						>
							{t.label}
						</span>
						<Popover.Root>
							<Popover.Trigger
								class="text-muted-foreground/70 transition-colors hover:text-foreground"
								aria-label="What is {t.label}?"
							>
								<Info class="size-3.5" weight="bold" />
							</Popover.Trigger>
							<Popover.Content class="max-w-xs text-xs leading-relaxed">
								{t.explain}
							</Popover.Content>
						</Popover.Root>
					</div>
					<span class="text-2xl font-semibold tabular-nums {t.accent ?? ''}">{t.value}</span>
					{#if t.sub}<span class="text-xs text-muted-foreground">{t.sub}</span>{/if}
				</div>
			{/snippet}

			{@render tile({
				label: 'Grid cost',
				value: money(c.importCost + c.standingCharge),
				sub: `import ${money(c.importCost)} + standing ${money(c.standingCharge)}`,
				explain:
					'What you actually pay the utility: imported energy priced at your tariff plus the standing charge. Export earnings are NOT subtracted here — this is the bill before feed-in income.'
			})}
			{@render tile({
				label: 'Effective cost',
				value: money(c.net),
				sub: `grid cost − ${money(c.exportEarnings)} export`,
				accent: c.net < 0 ? 'text-emerald-500' : '',
				explain:
					'Grid cost after subtracting export (feed-in) earnings — your net out-of-pocket for the period. Negative means feed-in outweighed your bill.'
			})}
			{@render tile({
				label: 'Grid import',
				value: kwh(c.importKwh),
				sub: `${money(c.importCost)} at your tariff`,
				explain: 'Energy drawn from the grid over the period, and what it cost to import.'
			})}
			{@render tile({
				label: 'Grid export',
				value: kwh(c.exportKwh),
				sub: `${money(c.exportEarnings)} feed-in`,
				explain: 'Energy fed back to the grid over the period, and the feed-in earnings it produced.'
			})}
			{@render tile({
				label: 'Solar saving',
				value: money(c.solarSavings),
				sub: solarSavingBreakdown ?? 'self-consumed energy',
				accent: c.solarSavings > 0 ? 'text-emerald-500' : '',
				explain:
					'Value of solar/battery energy you used on-site instead of buying it: self-consumed kWh priced at the grid rate you would have paid. Excludes feed-in (that is Grid export).'
			})}
			{@render tile({
				label: 'Total savings',
				value: money(c.savings),
				sub: `solar saving + ${money(c.exportEarnings)} export`,
				accent: c.savings > 0 ? 'text-emerald-500' : '',
				explain:
					'How much better off you are than buying everything from the grid: solar saving plus export earnings. (Standing charge is excluded — you would pay it on all-grid too.)'
			})}
		</div>

		<!-- Contextual total-cost bars. Window/granularity follow the picked range
		     "one level up" (range.chart), independent of the tiles above. -->
		{#if costHasData}
			<section
				class="flex flex-col gap-3 border border-border p-4"
				transition:fade={{ duration: 200 }}
			>
				<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					Total cost — {range.chart.caption}
				</h2>
				<CostBarChart points={series.points} bucket={series.bucket} currency={c.currency} />
			</section>
		{/if}

		<!-- Energy split (grid-vs-solar, self-consumed-vs-exported), same range as above.
		     Owns its own section + fade and hides itself when the range has no energy. -->
		<EnergySplitChart chart={range.chart} caption={range.chart.caption} />

		<!-- Import by band -->
		{#if c.byBand.length > 0}
			<section
				class="flex flex-col gap-3 border border-border p-4"
				transition:fade={{ duration: 200 }}
			>
				<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					Import by tariff band
				</h2>
				<div class="flex flex-col gap-1.5 text-sm">
					{#each c.byBand as b (b.name)}
						<div class="flex items-center justify-between gap-3 tabular-nums">
							<span>{b.name}</span>
							<span class="text-muted-foreground">{kwh(b.importKwh)}</span>
							<span class="w-20 text-right">{money(b.cost)}</span>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>
