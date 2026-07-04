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

	// Fixed 5-minute window ending at the latest sample, so the trace scrolls
	// left in real time instead of rescaling as points accumulate.
	const WINDOW_MS = 5 * 60 * 1000;
	const maxT = $derived(points.at(-1)?.t ?? 0);
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
		{#if points.length > 1}
			<Chart.Container config={{}} class="aspect-auto h-16 w-full">
				<AreaChart
					data={points}
					x="t"
					y="v"
					xDomain={[maxT - WINDOW_MS, maxT]}
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
