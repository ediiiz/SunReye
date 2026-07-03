<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { formatValue, flowLabel } from '$lib/inverter/format';
	import { kindValueClass } from '$lib/inverter/widgets';
	import type { ManifestMetric } from '$lib/inverter/types';

	let { metric, value }: { metric: ManifestMetric; value: number | undefined } = $props();

	const flow = $derived(flowLabel(metric, value));
</script>

<div class="flex items-center justify-between gap-4 border-b border-border/40 py-1.5 text-sm last:border-b-0">
	<span class="min-w-0 truncate text-muted-foreground">{metric.label}</span>
	<div class="flex shrink-0 items-center gap-2">
		{#if flow}
			<span class="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{flow}</span>
		{/if}
		{#if metric.kind === 'status'}
			<Badge variant="secondary" class="font-normal">{formatValue(metric, value)}</Badge>
		{:else}
			<span class={`font-medium tabular-nums ${kindValueClass(metric.kind)}`}>
				{formatValue(metric, value)}
			</span>
			{#if metric.unit}
				<span class="w-9 text-right text-xs text-muted-foreground">{metric.unit}</span>
			{/if}
		{/if}
	</div>
</div>
