<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages';

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

<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
	{#if children}
		<div class="sm:mr-auto">{@render children()}</div>
	{/if}
	<Button variant="outline" class="w-full sm:w-auto" onclick={ontest} disabled={testing}>
		{testing ? m.conn_testing() : m.conn_test()}
	</Button>
	<Button class="w-full sm:w-auto" onclick={onsave} disabled={saving}>
		{saving ? m.action_saving() : m.action_save()}
	</Button>
</div>
