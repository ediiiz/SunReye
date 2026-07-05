<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';

	// Shared footer for the connection settings forms: an optional test result
	// line plus Test / Save buttons. `children` renders extra controls (e.g. a
	// snapshot trigger) to the left of the buttons.
	let {
		result = null,
		testing,
		saving,
		ontest,
		onsave,
		children
	}: {
		result?: { ok: boolean; message: string } | null;
		testing: boolean;
		saving: boolean;
		ontest: () => void;
		onsave: () => void;
		children?: Snippet;
	} = $props();
</script>

{#if result}
	<p class="text-sm {result.ok ? 'text-emerald-500' : 'text-destructive'}">{result.message}</p>
{/if}

<div class="flex items-center justify-end gap-2">
	{#if children}
		<div class="mr-auto">{@render children()}</div>
	{/if}
	<Button variant="outline" onclick={ontest} disabled={testing}>
		{testing ? 'Testing…' : 'Test connection'}
	</Button>
	<Button onclick={onsave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
</div>
