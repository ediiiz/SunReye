<script lang="ts">
	import { inverter } from '$lib/inverter/store.svelte';
	import { formatValue } from '$lib/inverter/format';
	import type { CanonicalRole, ManifestMetric } from '$lib/inverter/types';
	import Kpi from '$lib/components/inverter/kpi.svelte';
	import PowerFlow from '$lib/components/inverter/power-flow.svelte';
	import BatteryBar from '$lib/components/inverter/battery-bar.svelte';
	import SubsystemSection from '$lib/components/inverter/subsystem-section.svelte';
	import IndexedGroup from '$lib/components/inverter/indexed-group.svelte';

	const caps = $derived(inverter.capabilities);

	const KPI_DEFS: { role: CanonicalRole; accent: string; diverging?: boolean }[] = [
		{ role: 'pv.total.power', accent: 'var(--color-chart-1)' },
		{ role: 'battery.soc', accent: 'var(--color-chart-2)' },
		{ role: 'battery.power', accent: 'var(--color-chart-3)' },
		{ role: 'grid.power', accent: 'var(--color-chart-4)', diverging: true },
		{ role: 'load.power', accent: 'var(--color-chart-5)' },
		{ role: 'production.today', accent: 'var(--color-chart-2)' }
	];

	const kpis = $derived(
		KPI_DEFS.map((d) => ({ ...d, metric: inverter.byRole(d.role) })).filter(
			(k): k is typeof k & { metric: ManifestMetric } => k.metric !== undefined
		)
	);

	const socMetric = $derived(inverter.byRole('battery.soc'));
	const batteryPowerMetric = $derived(inverter.byRole('battery.power'));
	const batteryRows = $derived(
		inverter.inGroup('battery').filter((m) => m.role !== 'battery.soc' && m.role !== 'battery.power')
	);

	const inverterStatus = $derived(
		(
			[
				'inverter.status',
				'inverter.relay_status',
				'inverter.temperature.dc',
				'inverter.temperature.ac'
			] as CanonicalRole[]
		)
			.map((r) => inverter.byRole(r))
			.filter((m): m is ManifestMetric => m !== undefined)
	);

	const pvStrings = $derived(Array.from({ length: caps?.pvStrings ?? 0 }, (_, i) => i + 1));
	const phases = $derived(Array.from({ length: caps?.phases ?? 0 }, (_, i) => i + 1));

	const stringRoles: CanonicalRole[] = ['pv.string.power', 'pv.string.voltage', 'pv.string.current'];
	const phaseRoles: CanonicalRole[] = ['grid.phase.voltage', 'grid.phase.current', 'grid.phase.power'];
</script>

<div class="flex w-full flex-col gap-8 p-4 sm:p-6">
	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Power flow</h2>
		<PowerFlow />
	</section>

	<section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each kpis as k (k.role)}
			{@const v = inverter.value(k.metric.key)}
			<div class="border border-border">
				<Kpi
					label={k.metric.label}
					value={v}
					text={formatValue(k.metric, v)}
					unit={k.metric.unit ?? ''}
					points={inverter.series(k.metric.key)}
					accent={k.accent}
					diverging={k.diverging ?? false}
				/>
			</div>
		{/each}
	</section>

	<div class="grid gap-6 lg:grid-cols-2">
		{#if caps?.battery}
			<SubsystemSection title="Battery" metrics={batteryRows}>
				<BatteryBar
					soc={socMetric ? inverter.value(socMetric.key) : undefined}
					power={batteryPowerMetric ? inverter.value(batteryPowerMetric.key) : undefined}
				/>
			</SubsystemSection>
		{/if}

		{#if inverterStatus.length > 0}
			<SubsystemSection title="Inverter" metrics={inverterStatus} />
		{/if}

		{#if pvStrings.length > 0}
			<SubsystemSection title={`Solar · ${pvStrings.length} strings`} metrics={[]}>
				<IndexedGroup label="String" indices={pvStrings} roles={stringRoles} />
			</SubsystemSection>
		{/if}

		{#if caps?.grid && phases.length > 0}
			<SubsystemSection title={`Grid · ${phases.length}-phase`} metrics={[]}>
				<IndexedGroup
					label="Phase"
					indices={phases}
					roles={phaseRoles}
					columns="sm:grid-cols-2 lg:grid-cols-3"
				/>
			</SubsystemSection>
		{/if}

		{#if caps?.generator}
			<SubsystemSection title="Generator" metrics={inverter.inGroup('generator')} />
		{/if}

		{#if caps?.backupLoad}
			<SubsystemSection title="Backup load" metrics={inverter.inGroup('load')} />
		{/if}
	</div>
</div>
