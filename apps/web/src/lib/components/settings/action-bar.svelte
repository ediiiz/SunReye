<script lang="ts">
	import type { Snippet } from 'svelte';

	// The standard settings action row. It sits at the top of a form and sticks
	// to the top of the scrolling panel, so the primary Save (and any Test) stay
	// reachable without scrolling past the body. `info` holds muted, left-aligned
	// content such as a test result or an admin-only note.
	let { info, children }: { info?: Snippet; children: Snippet } = $props();
</script>

<div
	class="sticky top-0 z-20 flex flex-col gap-2 border-b border-border bg-background/85 pb-3 backdrop-blur supports-backdrop-filter:bg-background/65 sm:flex-row sm:items-center sm:gap-3"
>
	<div class="min-w-0 text-sm sm:mr-auto">
		{#if info}{@render info()}{/if}
	</div>
	<div class="flex items-center justify-end gap-2">
		{@render children()}
	</div>
</div>
