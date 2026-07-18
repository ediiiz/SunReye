<script lang="ts">
	import type { Component } from 'svelte';
	import Sun from 'phosphor-svelte/lib/Sun';
	import House from 'phosphor-svelte/lib/House';
	import ArrowLineUp from 'phosphor-svelte/lib/ArrowLineUp';
	import ArrowLineDown from 'phosphor-svelte/lib/ArrowLineDown';
	import type { CanonicalRole } from '$lib/inverter/types';
	import { inverter } from '$lib/inverter/store.svelte';
	import { api } from '$lib/api';
	import * as m from '$lib/paraglide/messages';
	import AnimatedNumber from './animated-number.svelte';

	// The slice of /api/cost?range=today the cards render: money that flowed
	// through the meter plus the two ratio KPIs the server already derives.
	type CostToday = {
		currency: string;
		importCost: number;
		exportEarnings: number;
		/** Value of self-consumed solar: (load − import) priced at the grid rate. */
		solarSavings: number;
		/** (load − import) / load — autarky. */
		selfSufficiency: number | null;
		/** (production − export) / production. */
		selfConsumption: number | null;
	};

	let cost = $state<CostToday | null>(null);

	// The kWh headlines stream live over the WebSocket; the €/% figures come
	// from a rollup query, so poll once a minute (cheap, feels live on a wall
	// display) and resync when the tab becomes visible again. Failures (e.g.
	// tariff endpoint unavailable) simply leave the KPI rows off.
	$effect(() => {
		let stop = false;
		const load = async () => {
			const { data } = await api.api.cost.get({ query: { range: 'today' } });
			if (!stop) cost = (data as CostToday | null) ?? null;
		};
		load();
		const id = setInterval(load, 60 * 1000);
		const onVisible = () => document.visibilityState === 'visible' && load();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			stop = true;
			clearInterval(id);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	const money = (v: number, currency: string) =>
		new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v);
	const percent = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100);

	/** Secondary KPI rows: ratios render a mini meter, money a signed figure. */
	type Kpi =
		| { kind: 'ratio'; label: () => string; value: number }
		| { kind: 'money'; label: () => string; text: string; color: string };

	function kpisFor(role: CanonicalRole): Kpi[] {
		if (!cost) return [];
		switch (role) {
			case 'production.today':
				return cost.selfConsumption === null
					? []
					: [{ kind: 'ratio', label: m.energy_self_consumption, value: cost.selfConsumption }];
			case 'load.energy.today': {
				const rows: Kpi[] = [];
				if (cost.selfSufficiency !== null) {
					rows.push({ kind: 'ratio', label: m.energy_autarky, value: cost.selfSufficiency });
				}
				// What buying the self-consumed energy would have cost instead.
				rows.push({
					kind: 'money',
					label: m.energy_saved,
					text: `+${money(cost.solarSavings, cost.currency)}`,
					color: 'text-emerald-500'
				});
				return rows;
			}
			case 'grid.energy.exported.today':
				return [
					{
						kind: 'money',
						label: m.energy_earned,
						text: `+${money(cost.exportEarnings, cost.currency)}`,
						color: 'text-emerald-500'
					}
				];
			case 'grid.energy.imported.today':
				return [
					{
						kind: 'money',
						label: m.energy_spent,
						text: `−${money(cost.importCost, cost.currency)}`,
						color: 'text-red-500'
					}
				];
			default:
				return [];
		}
	}

	const DEFS: {
		role: CanonicalRole;
		label: () => string;
		icon: Component;
		accent: string;
		tint: string;
		bar: string;
	}[] = [
		{ role: 'production.today', label: m.energy_production, icon: Sun, accent: 'text-chart-1', tint: 'bg-chart-1/15', bar: 'bg-chart-1' },
		{ role: 'load.energy.today', label: m.energy_consumption, icon: House, accent: 'text-chart-5', tint: 'bg-chart-5/15', bar: 'bg-chart-5' },
		{ role: 'grid.energy.exported.today', label: m.energy_feed_in, icon: ArrowLineUp, accent: 'text-chart-3', tint: 'bg-chart-3/15', bar: 'bg-chart-3' },
		{ role: 'grid.energy.imported.today', label: m.energy_purchase, icon: ArrowLineDown, accent: 'text-chart-4', tint: 'bg-chart-4/15', bar: 'bg-chart-4' }
	];

	// Only tiles whose role the active profile actually maps.
	const tiles = $derived(
		DEFS.map((d) => ({ ...d, metric: inverter.byRole(d.role) })).filter(
			(t): t is typeof t & { metric: NonNullable<typeof t.metric> } => t.metric !== undefined
		)
	);
</script>

{#if tiles.length > 0}
	<!-- lg+ sizes tracks by the cards actually mapped (auto-fit) so a profile
	     without e.g. grid energy roles doesn't leave empty columns. -->
	<div
		class="grid h-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]"
	>
		{#each tiles as t (t.role)}
			{@const value = inverter.value(t.metric.key)}
			{@const Icon = t.icon}
			{@const kpis = kpisFor(t.role)}
			<div
				class="flex flex-col justify-between gap-2 rounded-xl border border-border/60 bg-card p-3 sm:p-4"
			>
				<div class="flex items-start justify-between gap-2">
					<span
						class="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs 2xl:text-sm"
					>
						{t.label()}
					</span>
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-lg {t.tint} 2xl:size-10"
					>
						<Icon class="size-4.5 {t.accent} 2xl:size-5" weight="duotone" />
					</span>
				</div>
				<span class="text-2xl font-semibold tabular-nums leading-none xl:text-3xl 2xl:text-4xl">
					{#if value === undefined}
						—
					{:else}
						<AnimatedNumber {value} unit={t.metric.unit ?? ''} />
						<span class="ml-1 text-sm font-normal text-muted-foreground 2xl:text-base">
							{t.metric.unit ?? ''}
						</span>
					{/if}
				</span>
				{#if kpis.length > 0}
					<div class="flex flex-col gap-1">
						{#each kpis as kpi (kpi.kind)}
							<div class="flex items-baseline justify-between gap-2">
								<span
									class="truncate text-[0.6rem] uppercase tracking-wide text-muted-foreground 2xl:text-xs"
								>
									{kpi.label()}
								</span>
								{#if kpi.kind === 'ratio'}
									<span class="text-xs font-semibold tabular-nums 2xl:text-sm">
										{percent(kpi.value)}%
									</span>
								{:else}
									<span class={`text-xs font-semibold tabular-nums 2xl:text-sm ${kpi.color}`}>
										{kpi.text}
									</span>
								{/if}
							</div>
							{#if kpi.kind === 'ratio'}
								<div class="h-1 overflow-hidden rounded-full bg-border/60">
									<div
										class={`h-full rounded-full ${t.bar}`}
										style={`width:${percent(kpi.value)}%;transition:width 700ms ease`}
									></div>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
