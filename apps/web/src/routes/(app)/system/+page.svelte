<script lang="ts">
	import { inverter } from '$lib/inverter/store.svelte';
	import { formatValue } from '$lib/inverter/format';
	import type { CanonicalRole, ManifestMetric } from '$lib/inverter/types';
	import Kpi from '$lib/components/inverter/kpi.svelte';
	import BatteryBar from '$lib/components/inverter/battery-bar.svelte';
	import SubsystemSection from '$lib/components/inverter/subsystem-section.svelte';
	import IndexedGroup from '$lib/components/inverter/indexed-group.svelte';
	import { setPageHeader } from '$lib/page-header.svelte';
	import * as m from '$lib/paraglide/messages';

	$effect(() => setPageHeader(m.nav_system()));

	const caps = $derived(inverter.capabilities);

	// Canonical-role KPIs get a translated label from the role (not the profile's
	// author-chosen label), falling back to the profile label if unmapped.
	const KPI_DEFS: { role: CanonicalRole; label: () => string; accent: string; diverging?: boolean }[] =
		[
			{ role: 'pv.total.power', label: m.label_solar, accent: 'var(--color-chart-1)' },
			{ role: 'battery.power', label: m.label_battery, accent: 'var(--color-chart-3)' },
			{ role: 'grid.power', label: m.label_grid, accent: 'var(--color-chart-4)', diverging: true },
			{ role: 'load.power', label: m.label_load, accent: 'var(--color-chart-5)' }
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

	// Capabilities are server-derived and stay true even when a subsystem's
	// metrics are hidden from the dashboard (Settings → Sensors). Gate each
	// section on whether it still has *visible* metrics so hiding a group (e.g. an
	// unconnected generator) drops its section instead of leaving an empty header.
	const generatorMetrics = $derived(inverter.inGroup('generator'));
	const backupMetrics = $derived(inverter.inGroup('load'));
	const hasBatteryContent = $derived(
		batteryRows.length > 0 || socMetric !== undefined || batteryPowerMetric !== undefined
	);
	const hasStringMetrics = $derived(
		inverter.metrics.some((mtr) => mtr.role !== undefined && stringRoles.includes(mtr.role))
	);
	const hasPhaseMetrics = $derived(
		inverter.metrics.some((mtr) => mtr.role !== undefined && phaseRoles.includes(mtr.role))
	);
</script>

<div class="flex w-full flex-col gap-8 p-4 sm:p-6">
	<section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
		{#each kpis as k (k.role)}
			{@const v = inverter.value(k.metric.key)}
			<div class="min-w-0 border border-border">
				<Kpi
					label={k.label()}
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
		{#if caps?.battery && hasBatteryContent}
			<SubsystemSection title={m.label_battery()} metrics={batteryRows}>
				<BatteryBar
					soc={socMetric ? inverter.value(socMetric.key) : undefined}
					power={batteryPowerMetric ? inverter.value(batteryPowerMetric.key) : undefined}
				/>
			</SubsystemSection>
		{/if}

		{#if inverterStatus.length > 0}
			<SubsystemSection title={m.label_inverter()} metrics={inverterStatus} />
		{/if}

		{#if pvStrings.length > 0 && hasStringMetrics}
			<SubsystemSection title={m.system_solar_strings({ count: pvStrings.length })} metrics={[]}>
				<IndexedGroup label={m.label_string()} indices={pvStrings} roles={stringRoles} />
			</SubsystemSection>
		{/if}

		{#if caps?.grid && phases.length > 0 && hasPhaseMetrics}
			<SubsystemSection title={m.system_grid_phase({ count: phases.length })} metrics={[]}>
				<IndexedGroup
					label={m.label_phase()}
					indices={phases}
					roles={phaseRoles}
					columns="sm:grid-cols-2 lg:grid-cols-3"
				/>
			</SubsystemSection>
		{/if}

		{#if caps?.generator && generatorMetrics.length > 0}
			<SubsystemSection title={m.label_generator()} metrics={generatorMetrics} />
		{/if}

		{#if caps?.backupLoad && backupMetrics.length > 0}
			<SubsystemSection title={m.system_backup_load()} metrics={backupMetrics} />
		{/if}
	</div>
</div>
