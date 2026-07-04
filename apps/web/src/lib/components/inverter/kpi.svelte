<script lang="ts">
	import { AreaChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import AnimatedNumber from './animated-number.svelte';
	import type { LivePoint } from '$lib/inverter/types';

	let {
		label,
		value,
		text,
		unit = '',
		points = [],
		accent = 'var(--color-chart-2)',
		sub = null
	}: {
		label: string;
		/** Raw numeric value (animated); undefined/non-numeric falls back to `text`. */
		value?: number;
		/** Pre-formatted display used when `value` is not a finite number (status, em dash). */
		text: string;
		unit?: string;
		points?: LivePoint[];
		accent?: string;
		sub?: string | null;
	} = $props();

	const animate = $derived(value !== undefined && Number.isFinite(value));

	// Sparkline is a fixed-width scrolling window: pin the x-domain to the last
	// `SPARK_WINDOW_MS` ending at the newest sample so it slides left over time
	// instead of cramming an ever-growing buffer into the same box.
	const SPARK_WINDOW_MS = 2 * 60 * 1000;
	const lastT = $derived(points.at(-1)?.t);
	const spark = $derived(
		lastT === undefined ? points : points.filter((p) => p.t >= lastT - SPARK_WINDOW_MS)
	);
	const xDomain = $derived(
		lastT === undefined ? undefined : [lastT - SPARK_WINDOW_MS, lastT]
	);
</script>

<div class="flex flex-col gap-2 px-4 py-3">
	<span class="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
		{label}
	</span>
	<div class="flex items-baseline gap-1.5">
		{#if animate}
			<AnimatedNumber value={value as number} class="text-2xl font-semibold tabular-nums leading-none" />
		{:else}
			<span class="text-2xl font-semibold tabular-nums leading-none">{text}</span>
		{/if}
		{#if unit}<span class="text-xs text-muted-foreground">{unit}</span>{/if}
	</div>
	{#if sub}
		<span class="text-xs text-muted-foreground">{sub}</span>
	{/if}
	<div class="mt-1 h-16" style="--color-primary: {accent}">
		{#if spark.length > 1}
			<Chart.Container config={{}} class="aspect-auto h-16 w-full">
				<AreaChart
					data={spark}
					x="t"
					{xDomain}
					y="v"
					axis={false}
					grid={false}
					rule={false}
					legend={false}
					tooltipContext={false}
					padding={{ top: 4, bottom: 2, left: 0, right: 0 }}
				/>
			</Chart.Container>
		{/if}
	</div>
</div>
