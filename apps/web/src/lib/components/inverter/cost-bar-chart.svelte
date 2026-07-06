<script lang="ts">
	import { BarChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import { periodLabel, type CostBucket } from '$lib/cost/ranges';

	// One bar of net cost per period. Mirrors the server's CostSeriesPoint
	// (apps/server/src/cost.ts).
	type Point = {
		bucket: string;
		importCost: number;
		exportEarnings: number;
		net: number;
	};

	let {
		points,
		bucket,
		currency
	}: { points: Point[]; bucket: CostBucket; currency: string } = $props();

	// Bars are colored by sign: a credit (net < 0, you earned more than you spent)
	// reads green, a cost reads primary. Driven by the chart's ordinal `c` scale
	// (cRange auto-builds it) so each bar picks its own fill.
	const COST_COLOR = 'var(--color-primary)';
	const CREDIT_COLOR = '#10b981'; // emerald-500, matches the byDay list below
	const config: Chart.ChartConfig = { net: { label: 'Net cost', color: COST_COLOR } };

	const money = (v: number) =>
		new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v);

	const data = $derived(points.map((p) => ({ ...p, label: periodLabel(p.bucket, bucket) })));
	const hasData = $derived(points.some((p) => p.importCost !== 0 || p.exportEarnings !== 0));
</script>

{#if !hasData}
	<p class="text-sm text-muted-foreground">No cost data in this range yet.</p>
{:else}
	<Chart.Container {config} class="h-64 w-full">
		<BarChart
			{data}
			x="label"
			y="net"
			c={(d) => (d.net < 0 ? 'credit' : 'cost')}
			cDomain={['cost', 'credit']}
			cRange={[COST_COLOR, CREDIT_COLOR]}
			bandPadding={0.25}
			padding={{ top: 8, right: 8, bottom: 20, left: 52 }}
		>
			{#snippet tooltip()}
				<Chart.Tooltip hideIndicator>
					{#snippet formatter({ value })}
						<span class="text-muted-foreground">Net</span>
						<span class="ml-auto font-medium tabular-nums">{money(Number(value))}</span>
					{/snippet}
				</Chart.Tooltip>
			{/snippet}
		</BarChart>
	</Chart.Container>
{/if}
