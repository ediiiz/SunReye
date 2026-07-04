<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import AnimatedNumber from './animated-number.svelte';
	import { formatValue } from '$lib/inverter/format';
	import { kindValueClass } from '$lib/inverter/widgets';
	import type { ManifestMetric } from '$lib/inverter/types';

	let { metric, value }: { metric: ManifestMetric; value: number | undefined } = $props();

	const numeric = $derived(value !== undefined && Number.isFinite(value));
</script>

<div class="flex items-center justify-between gap-4 border-b border-border/40 py-1.5 text-sm last:border-b-0">
	<span class="min-w-0 truncate text-muted-foreground">{metric.label}</span>
	<div class="flex shrink-0 items-center gap-2">
		{#if metric.kind === 'status'}
			<Badge variant="secondary" class="font-normal">{formatValue(metric, value)}</Badge>
		{:else}
			{#if numeric}
				<AnimatedNumber
					value={value as number}
					class={`font-medium tabular-nums ${kindValueClass(metric.kind)}`}
				/>
			{:else}
				<span class={`font-medium tabular-nums ${kindValueClass(metric.kind)}`}>
					{formatValue(metric, value)}
				</span>
			{/if}
			{#if metric.unit}
				<span class="w-9 text-right text-xs text-muted-foreground">{metric.unit}</span>
			{/if}
		{/if}
	</div>
</div>
