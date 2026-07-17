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

	const DEFS: { role: CanonicalRole; label: () => string; icon: Component; accent: string }[] = [
		{ role: 'production.today', label: m.energy_production, icon: Sun, accent: 'text-chart-1' },
		{ role: 'load.energy.today', label: m.energy_consumption, icon: House, accent: 'text-chart-5' },
		{ role: 'grid.energy.exported.today', label: m.energy_feed_in, icon: ArrowLineUp, accent: 'text-chart-3' },
		{ role: 'grid.energy.imported.today', label: m.energy_purchase, icon: ArrowLineDown, accent: 'text-chart-4' }
	];

	// Only tiles whose role the active profile actually maps.
	const tiles = $derived(
		DEFS.map((d) => ({ ...d, metric: inverter.byRole(d.role) })).filter(
			(t): t is typeof t & { metric: NonNullable<typeof t.metric> } => t.metric !== undefined
		)
	);
</script>

{#if tiles.length > 0}
	<div class="grid grid-cols-2 gap-3">
		{#each tiles as t (t.role)}
			{@const value = inverter.value(t.metric.key)}
			{@const Icon = t.icon}
			<div class="flex flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2.5">
				<span class="flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
					<Icon class="size-3.5 {t.accent}" weight="duotone" />
					{t.label()}
				</span>
				<span class="text-xl font-semibold tabular-nums">
					{#if value === undefined}
						—
					{:else}
						<AnimatedNumber {value} unit={t.metric.unit ?? ''} />
						<span class="ml-0.5 text-xs font-normal text-muted-foreground">
							{t.metric.unit ?? ''}
						</span>
					{/if}
				</span>
			</div>
		{/each}
	</div>
{/if}
