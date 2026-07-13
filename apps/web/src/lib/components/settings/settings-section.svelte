<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		actions,
		children
	}: {
		title: string;
		/** Optional right-aligned header content (filter, button, status badge). */
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="flex flex-col gap-4 border border-border p-4">
	{#if actions}
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
			{@render actions()}
		</div>
	{:else}
		<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
	{/if}
	{@render children()}
</section>
