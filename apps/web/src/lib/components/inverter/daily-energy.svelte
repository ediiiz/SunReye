<script lang="ts">
	import type { Component } from 'svelte';
	import Sun from 'phosphor-svelte/lib/Sun';
	import House from 'phosphor-svelte/lib/House';
	import ArrowLineUp from 'phosphor-svelte/lib/ArrowLineUp';
	import ArrowLineDown from 'phosphor-svelte/lib/ArrowLineDown';
	import type { CanonicalRole } from '$lib/inverter/types';
	import { inverter } from '$lib/inverter/store.svelte';
	import * as m from '$lib/paraglide/messages';
	import AnimatedNumber from './animated-number.svelte';

	const DEFS: {
		role: CanonicalRole;
		label: () => string;
		icon: Component;
		accent: string;
		tint: string;
	}[] = [
		{ role: 'production.today', label: m.energy_production, icon: Sun, accent: 'text-chart-1', tint: 'bg-chart-1/15' },
		{ role: 'load.energy.today', label: m.energy_consumption, icon: House, accent: 'text-chart-5', tint: 'bg-chart-5/15' },
		{ role: 'grid.energy.exported.today', label: m.energy_feed_in, icon: ArrowLineUp, accent: 'text-chart-3', tint: 'bg-chart-3/15' },
		{ role: 'grid.energy.imported.today', label: m.energy_purchase, icon: ArrowLineDown, accent: 'text-chart-4', tint: 'bg-chart-4/15' }
	];

	// Only tiles whose role the active profile actually maps.
	const tiles = $derived(
		DEFS.map((d) => ({ ...d, metric: inverter.byRole(d.role) })).filter(
			(t): t is typeof t & { metric: NonNullable<typeof t.metric> } => t.metric !== undefined
		)
	);
</script>

{#if tiles.length > 0}
	<div class="grid h-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
		{#each tiles as t (t.role)}
			{@const value = inverter.value(t.metric.key)}
			{@const Icon = t.icon}
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
			</div>
		{/each}
	</div>
{/if}
