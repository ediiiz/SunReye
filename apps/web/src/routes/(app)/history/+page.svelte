<script lang="ts">
	import { inverter } from '$lib/inverter/store.svelte';
	import { Button } from '$lib/components/ui/button';
	import HistoryChart from '$lib/components/inverter/history-chart.svelte';
	import type { CanonicalRole, ManifestMetric } from '$lib/inverter/types';

	const RANGES = [
		{ id: '24h', label: '24 hours', hours: 24, bucket: 'hour' as const },
		{ id: '7d', label: '7 days', hours: 168, bucket: 'hour' as const },
		{ id: '30d', label: '30 days', hours: 720, bucket: 'day' as const }
	];
	let rangeId = $state('24h');
	const range = $derived(RANGES.find((r) => r.id === rangeId) ?? RANGES[0]);

	// Curated chartable metrics (by role), colored from the chart palette.
	const CHART_ROLES: { role: CanonicalRole; color: string }[] = [
		{ role: 'pv.total.power', color: 'var(--color-chart-1)' },
		{ role: 'production.today', color: 'var(--color-chart-2)' },
		{ role: 'battery.soc', color: 'var(--color-chart-3)' },
		{ role: 'battery.power', color: 'var(--color-chart-4)' },
		{ role: 'grid.power', color: 'var(--color-chart-5)' },
		{ role: 'load.power', color: 'var(--color-chart-1)' },
		{ role: 'battery.temperature', color: 'var(--color-chart-3)' },
		{ role: 'inverter.temperature.dc', color: 'var(--color-chart-4)' }
	];

	const charts = $derived(
		CHART_ROLES.map((c) => ({ ...c, metric: inverter.byRole(c.role) })).filter(
			(c): c is typeof c & { metric: ManifestMetric } => c.metric !== undefined
		)
	);
</script>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-lg font-semibold">History</h1>
			<p class="text-sm text-muted-foreground">
				Downsampled trends from the continuous-aggregate rollups.
			</p>
		</div>
		<div class="flex items-center gap-1 border border-border p-1">
			{#each RANGES as r (r.id)}
				<Button
					variant={rangeId === r.id ? 'default' : 'ghost'}
					size="sm"
					onclick={() => (rangeId = r.id)}
				>
					{r.label}
				</Button>
			{/each}
		</div>
	</div>

	{#if charts.length === 0}
		<div class="flex h-40 items-center justify-center border border-border text-sm text-muted-foreground">
			Waiting for the inverter profile…
		</div>
	{:else}
		<div class="grid gap-4 lg:grid-cols-2">
			{#each charts as c (c.role)}
				<HistoryChart metric={c.metric} hours={range.hours} bucket={range.bucket} color={c.color} />
			{/each}
		</div>
	{/if}
</div>
