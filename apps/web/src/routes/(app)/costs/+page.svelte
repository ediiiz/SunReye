<script lang="ts">
	import { api } from '$lib/api';
	import CostRangePicker from '$lib/components/inverter/cost-range-picker.svelte';
	import CostBarChart from '$lib/components/inverter/cost-bar-chart.svelte';
	import EnergySplitChart from '$lib/components/inverter/energy-split-chart.svelte';
	import { resolveCostPreset, type CostRange } from '$lib/cost/ranges';

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
		selfSufficiency: number | null;
		selfConsumption: number | null;
		byDay: {
			date: string;
			importCost: number;
			exportEarnings: number;
			net: number;
		}[];
		byBand: { name: string; importKwh: number; cost: number }[];
	};

	// One bar of the contextual chart. Mirrors the server's CostSeriesPoint.
	type SeriesPoint = { bucket: string; importCost: number; exportEarnings: number; net: number };

	let range = $state<CostRange>(resolveCostPreset('month'));
	let cost = $state<Cost | null>(null);
	let loading = $state(true);
	let series = $state<SeriesPoint[]>([]);

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
			series = (data ?? []) as SeriesPoint[];
		});
		return () => {
			cancelled = true;
		};
	});

	const money = (v: number) =>
		new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: cost?.currency ?? 'EUR'
		}).format(v);
	const kwh = (v: number) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh`;
	const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

	// byDay bar chart scaling (net cost per day, signed).
	const maxAbs = $derived(Math.max(1e-9, ...(cost?.byDay ?? []).map((d) => Math.abs(d.net))));
	// byDay dates are typed as `YYYY-MM-DD`, but at runtime may arrive as a Date or
	// timestamp. Parse a bare date at local midnight so it isn't shifted a day in
	// negative UTC offsets; hand everything else straight to `new Date`. Fall back
	// to the raw value rather than rendering "Invalid Date".
	const dayLabel = (iso: string) => {
		const d =
			typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)
				? new Date(`${iso}T00:00:00`)
				: new Date(iso);
		return Number.isNaN(d.getTime())
			? String(iso ?? '')
			: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	};
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
		<div class="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
			{#snippet tile(label: string, value: string, sub?: string, accent?: string)}
				<div class="flex flex-col gap-1 bg-background px-4 py-3">
					<span class="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
						{label}
					</span>
					<span class="text-2xl font-semibold tabular-nums {accent ?? ''}">{value}</span>
					{#if sub}<span class="text-xs text-muted-foreground">{sub}</span>{/if}
				</div>
			{/snippet}

			{@render tile(
				'Net cost',
				money(c.net),
				`incl. ${money(c.standingCharge)} standing`,
				c.net < 0 ? 'text-emerald-500' : ''
			)}
			{@render tile('Grid import', money(c.importCost), kwh(c.importKwh))}
			{@render tile('Export earnings', money(c.exportEarnings), kwh(c.exportKwh))}
			{@render tile(
				'Solar savings',
				money(c.solarSavings),
				'self-consumed × grid price',
				c.solarSavings > 0 ? 'text-emerald-500' : ''
			)}
			{@render tile('Savings vs grid-only', money(c.savings), `incl. ${money(c.exportEarnings)} export`)}
			{@render tile('Self-sufficiency', pct(c.selfSufficiency), 'of load from solar/battery')}
			{@render tile('Self-consumption', pct(c.selfConsumption), 'of production used on-site')}
		</div>

		<!-- Contextual net-cost bars. Window/granularity follow the picked range
		     "one level up" (range.chart), independent of the tiles above. -->
		<section class="flex flex-col gap-3 border border-border p-4">
			<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
				Net cost — {range.chart.caption}
			</h2>
			<CostBarChart points={series} bucket={range.chart.bucket} currency={c.currency} />
		</section>

		<!-- Energy split (grid-vs-solar, self-consumed-vs-exported), same range as above. -->
		<section class="border border-border p-4">
			<EnergySplitChart chart={range.chart} caption={range.chart.caption} />
		</section>

		<!-- Daily net cost -->
		<section class="flex flex-col gap-3 border border-border p-4">
			<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
				Net cost per day
			</h2>
			{#if c.byDay.length === 0}
				<p class="text-sm text-muted-foreground">No data in this range yet.</p>
			{:else}
				<div class="flex flex-col gap-1.5">
					{#each c.byDay as d (d.date)}
						<div class="flex items-center gap-3 text-xs">
							<span class="w-16 shrink-0 text-muted-foreground">{dayLabel(d.date)}</span>
							<div class="flex h-4 flex-1 items-center">
								<div
									class="h-full {d.net < 0 ? 'bg-emerald-500/70' : 'bg-primary/70'}"
									style="width: {(Math.abs(d.net) / maxAbs) * 100}%"
								></div>
							</div>
							<span class="w-20 shrink-0 text-right tabular-nums">{money(d.net)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Import by band -->
		{#if c.byBand.length > 0}
			<section class="flex flex-col gap-3 border border-border p-4">
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
