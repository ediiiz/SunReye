<script lang="ts">
	import { AreaChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import type { LivePoint } from '$lib/inverter/types';

	let {
		label,
		value,
		unit = '',
		points = [],
		accent = 'var(--color-chart-2)',
		sub = null
	}: {
		label: string;
		value: string;
		unit?: string;
		points?: LivePoint[];
		accent?: string;
		sub?: string | null;
	} = $props();
</script>

<div class="flex flex-col gap-2 px-4 py-3">
	<span class="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
		{label}
	</span>
	<div class="flex items-baseline gap-1.5">
		<span class="text-2xl font-semibold tabular-nums leading-none">{value}</span>
		{#if unit}<span class="text-xs text-muted-foreground">{unit}</span>{/if}
	</div>
	{#if sub}
		<span class="text-xs text-muted-foreground">{sub}</span>
	{/if}
	<div class="h-9" style="--color-primary: {accent}">
		{#if points.length > 1}
			<Chart.Container config={{}} class="aspect-auto h-9 w-full">
				<AreaChart
					data={points}
					x="t"
					y="v"
					axis={false}
					grid={false}
					rule={false}
					legend={false}
					tooltipContext={false}
					padding={{ top: 3, bottom: 3, left: 0, right: 0 }}
				/>
			</Chart.Container>
		{/if}
	</div>
</div>
