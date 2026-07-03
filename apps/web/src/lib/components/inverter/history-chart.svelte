<script lang="ts">
	import { AreaChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { api } from '$lib/api';
	import type { ManifestMetric } from '$lib/inverter/types';

	let {
		metric,
		hours,
		bucket,
		color = 'var(--color-chart-2)'
	}: {
		metric: ManifestMetric;
		hours: number;
		bucket: 'hour' | 'day';
		color?: string;
	} = $props();

	type Row = { time: string; avg: number; min: number; max: number };
	let rows = $state<Row[]>([]);
	let loading = $state(true);

	// Refetch whenever the metric or range changes.
	$effect(() => {
		const query = { metric: metric.key, hours, bucket, limit: 5000 };
		let cancelled = false;
		loading = true;
		api.api.history.rollup.get({ query }).then(({ data }) => {
			if (cancelled) return;
			rows = (data ?? []) as Row[];
			loading = false;
		});
		return () => {
			cancelled = true;
		};
	});

	const chartData = $derived(rows.map((r) => ({ ...r, date: new Date(r.time) })));
	const config = $derived({ avg: { label: metric.label, color } });
</script>

<div class="flex flex-col gap-3 border border-border p-4">
	<div class="flex items-baseline justify-between">
		<h3 class="text-sm font-medium">{metric.label}</h3>
		{#if metric.unit}<span class="text-xs text-muted-foreground">{metric.unit}</span>{/if}
	</div>
	{#if loading}
		<Skeleton class="h-[200px] w-full" />
	{:else if chartData.length === 0}
		<div class="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
			No data for this range yet
		</div>
	{:else}
		<Chart.Container config={config} class="h-[200px] w-full" style="--color-primary: {color}">
			<AreaChart
				data={chartData}
				x="date"
				y="avg"
				padding={{ top: 8, right: 8, bottom: 20, left: 44 }}
			>
				{#snippet tooltip()}
					<Chart.Tooltip />
				{/snippet}
			</AreaChart>
		</Chart.Container>
	{/if}
</div>
