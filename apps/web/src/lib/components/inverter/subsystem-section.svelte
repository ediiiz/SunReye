<script lang="ts">
	import { inverter } from '$lib/inverter/store.svelte';
	import type { ManifestMetric } from '$lib/inverter/types';
	import StatRow from './stat-row.svelte';

	let {
		title,
		metrics,
		children
	}: {
		title: string;
		metrics: ManifestMetric[];
		children?: import('svelte').Snippet;
	} = $props();
</script>

<section class="flex flex-col gap-4 border border-border p-4">
	<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
	{@render children?.()}
	{#if metrics.length > 0}
		<div class="flex flex-col">
			{#each metrics as m (m.key)}
				<StatRow metric={m} value={inverter.value(m.key)} />
			{/each}
		</div>
	{/if}
</section>
