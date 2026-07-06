<script lang="ts">
	import { BarChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import ChartLegend from '$lib/components/inverter/chart-legend.svelte';
	import { COST_X_TICKS, periodLabel, type CostBucket } from '$lib/cost/ranges';

	// One diverging stack per period. Mirrors the server's CostSeriesPoint
	// (apps/server/src/cost.ts): net = importCost − exportEarnings + standingCharge.
	type Point = {
		bucket: string;
		importCost: number;
		exportEarnings: number;
		standingCharge: number;
		net: number;
	};

	let {
		points,
		bucket,
		currency
	}: { points: Point[]; bucket: CostBucket; currency: string } = $props();

	// Costs stack upward (grid usage + the fixed standing charge), earnings pull
	// downward — so a period's bar shows what solar offsets and what it can't
	// (the connection fee + residual grid usage stay above the line). Hues follow
	// the energy-split chart: grid red = grid dependence, export blue = exported
	// production; standing teal is its own slot (all three CVD-validated,
	// dataviz skill).
	type Series = { key: string; label: string; color: string; value: (d: Point) => number };
	const series: Series[] = [
		{
			key: 'importCost',
			label: 'Grid usage',
			color: 'var(--color-energy-grid)',
			value: (d) => d.importCost
		},
		{
			key: 'standingCharge',
			label: 'Standing charge',
			color: 'var(--color-cost-standing)',
			value: (d) => d.standingCharge
		},
		{
			key: 'exportEarnings',
			label: 'Export earnings',
			color: 'var(--color-energy-export)',
			value: (d) => -d.exportEarnings
		}
	];

	const config: Chart.ChartConfig = Object.fromEntries(
		series.map((s) => [s.key, { label: s.label, color: s.color }])
	);

	const money = (v: number) =>
		new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v);

	const data = $derived(points.map((p) => ({ ...p, label: periodLabel(p.bucket, bucket) })));
</script>

<div class="flex flex-col gap-3">
	<Chart.Container {config} class="h-64 w-full">
		<BarChart
			{data}
			x="label"
			{series}
			seriesLayout="stackDiverging"
			bandPadding={0.25}
			stackPadding={2}
			padding={{ top: 8, right: 8, bottom: 20, left: 52 }}
			props={{ xAxis: { ticks: COST_X_TICKS[bucket] } }}
		>
			{#snippet tooltip()}
				<Chart.Tooltip>
					{#snippet formatter({ value, name, item, index, payload })}
						<div
							class="size-2.5 shrink-0 rounded-xs"
							style="background: {item.config?.color ?? item.color}"
						></div>
						<div class="flex flex-1 items-center justify-between gap-4 leading-none">
							<span class="text-muted-foreground">{name}</span>
							<span class="font-mono font-medium tabular-nums text-foreground">
								{money(Number(value))}
							</span>
						</div>
						{#if index === payload.length - 1}
							<!-- Earnings are already negative in the stack, so the sum of the
							     rows is the period's net — same figure as the Net cost tile. -->
							<div
								class="mt-0.5 flex basis-full items-center justify-between gap-4 border-t border-border/50 pt-1.5 leading-none"
							>
								<span class="text-muted-foreground">Net</span>
								<span class="font-mono font-medium tabular-nums text-foreground">
									{money(payload.reduce((sum, p) => sum + Number(p.value ?? 0), 0))}
								</span>
							</div>
						{/if}
					{/snippet}
				</Chart.Tooltip>
			{/snippet}
		</BarChart>
	</Chart.Container>
	<ChartLegend items={series} />
</div>
