<script lang="ts">
	import type { Component } from 'svelte';
	import Sun from 'phosphor-svelte/lib/Sun';
	import BatteryChargingIcon from 'phosphor-svelte/lib/BatteryCharging';
	import Lightning from 'phosphor-svelte/lib/Lightning';
	import House from 'phosphor-svelte/lib/House';
	import Engine from 'phosphor-svelte/lib/Engine';
	import CpuIcon from 'phosphor-svelte/lib/Cpu';
	import ArrowDown from 'phosphor-svelte/lib/ArrowDown';
	import ArrowUp from 'phosphor-svelte/lib/ArrowUp';
	import type { CanonicalRole } from '$lib/inverter/types';
	import AnimatedNumber from './animated-number.svelte';
	import { inverter } from '$lib/inverter/store.svelte';

	type Dir = 'in' | 'out' | 'idle';

	type Node = {
		label: string;
		icon: Component;
		value: number | undefined;
		unit: string;
		dir: Dir;
		state: string;
	};

	function power(role: CanonicalRole): number | undefined {
		const m = inverter.byRole(role);
		return m ? inverter.value(m.key) : undefined;
	}

	// dir describes flow relative to the inverter: `in` = power arriving at the
	// inverter (production/discharge/import), `out` = leaving it (load/charge/export).
	function node(
		label: string,
		icon: Component,
		value: number | undefined,
		positive: { dir: Dir; state: string },
		negative: { dir: Dir; state: string }
	): Node {
		const v = value ?? 0;
		const sense = v > 0.5 ? positive : v < -0.5 ? negative : { dir: 'idle' as Dir, state: 'Idle' };
		return { label, icon, value, unit: 'W', dir: sense.dir, state: sense.state };
	}

	const caps = $derived(inverter.capabilities);

	const nodes = $derived.by(() => {
		const list: Node[] = [];
		list.push(
			node('Solar', Sun, power('pv.total.power'), { dir: 'in', state: 'Producing' }, { dir: 'idle', state: 'Idle' })
		);
		if (caps?.battery) {
			list.push(
				node('Battery', BatteryChargingIcon, power('battery.power'), { dir: 'out', state: 'Charging' }, { dir: 'in', state: 'Discharging' })
			);
		}
		if (caps?.grid) {
			list.push(
				node('Grid', Lightning, power('grid.power'), { dir: 'in', state: 'Importing' }, { dir: 'out', state: 'Exporting' })
			);
		}
		if (caps?.backupLoad) {
			list.push(
				node('Load', House, power('load.power'), { dir: 'out', state: 'Consuming' }, { dir: 'out', state: 'Consuming' })
			);
		}
		if (caps?.generator) {
			list.push(
				node('Generator', Engine, power('generator.power'), { dir: 'in', state: 'Running' }, { dir: 'idle', state: 'Off' })
			);
		}
		return list;
	});
</script>

<div class="flex flex-wrap items-stretch gap-3">
	<!-- Inverter hub -->
	<div class="flex min-w-[7rem] flex-1 flex-col items-center justify-center gap-1 border border-primary/40 bg-primary/5 px-4 py-4">
		<CpuIcon class="size-6 text-primary" weight="duotone" />
		<span class="text-xs font-medium uppercase tracking-wide text-primary">Inverter</span>
		<span class="text-[0.7rem] text-muted-foreground">
			{inverter.status === 'live' ? 'Online' : 'Connecting…'}
		</span>
	</div>

	{#each nodes as n (n.label)}
		{@const Icon = n.icon}
		<div class="flex min-w-[7rem] flex-1 flex-col items-center justify-center gap-1 border border-border px-4 py-4">
			<Icon class="size-6 text-muted-foreground" weight="duotone" />
			<span class="text-xs font-medium uppercase tracking-wide">{n.label}</span>
			{#if n.value === undefined}
				<span class="text-lg font-semibold tabular-nums leading-none">—</span>
			{:else}
				<AnimatedNumber
					value={Math.abs(n.value)}
					class="text-lg font-semibold tabular-nums leading-none"
				/>
			{/if}
			<span class="text-[0.65rem] text-muted-foreground">{n.unit}</span>
			<span
				class="flex items-center gap-1 text-[0.7rem] uppercase tracking-wide"
				class:text-emerald-500={n.dir === 'in'}
				class:text-amber-500={n.dir === 'out'}
				class:text-muted-foreground={n.dir === 'idle'}
			>
				{#if n.dir === 'in'}
					<ArrowDown class="size-3" />
				{:else if n.dir === 'out'}
					<ArrowUp class="size-3" />
				{/if}
				{n.state}
			</span>
		</div>
	{/each}
</div>
