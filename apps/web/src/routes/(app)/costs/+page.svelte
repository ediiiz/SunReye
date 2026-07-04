<script lang="ts">
	import { api } from '$lib/api';
	import RangeSwitcher from '$lib/components/inverter/range-switcher.svelte';

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

	const RANGES = [
		{ id: 'today', label: 'Today' },
		{ id: 'month', label: 'This month' },
		{ id: 'year', label: 'This year' }
	] as const;
	let rangeId = $state<(typeof RANGES)[number]['id']>('month');

	let cost = $state<Cost | null>(null);
	let loading = $state(true);

	// Refetch whenever the range changes. `cancelled` guards against an earlier
	// request resolving after a later one and clobbering fresher data.
	$effect(() => {
		const range = rangeId;
		let cancelled = false;
		loading = true;
		api.api.cost.get({ query: { range } }).then(({ data }) => {
			if (cancelled) return;
			cost = (data as Cost) ?? null;
			loading = false;
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
		<RangeSwitcher options={RANGES} bind:value={rangeId} />
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
			{@render tile('Savings vs grid-only', money(c.savings), `grid-only ${money(c.gridOnlyCost)}`)}
			{@render tile('Self-sufficiency', pct(c.selfSufficiency), 'of load from solar/battery')}
			{@render tile('Self-consumption', pct(c.selfConsumption), 'of production used on-site')}
		</div>

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
