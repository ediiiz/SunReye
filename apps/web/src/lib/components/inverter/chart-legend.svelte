<script lang="ts">
	// Swatch legend shared by the cost / energy-split bar charts — keeps series
	// identity off color-alone (dataviz accessibility pass).
	let { items }: { items: readonly { key: string; label: string; color: string }[] } = $props();
</script>

<div class="flex flex-wrap gap-x-4 gap-y-1">
	{#each items as s (s.key)}
		<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
			<span class="size-2.5 rounded-xs" style="background: {s.color}"></span>
			{s.label}
		</span>
	{/each}
</div>
