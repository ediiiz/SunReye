<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	// Shared footer for the connection settings forms: an optional test result
	// line plus Test / Save buttons.
	let {
		result = null,
		testing,
		saving,
		ontest,
		onsave
	}: {
		result?: { ok: boolean; message: string } | null;
		testing: boolean;
		saving: boolean;
		ontest: () => void;
		onsave: () => void;
	} = $props();
</script>

{#if result}
	<p class="text-sm {result.ok ? 'text-emerald-500' : 'text-destructive'}">{result.message}</p>
{/if}

<div class="flex justify-end gap-2">
	<Button variant="outline" onclick={ontest} disabled={testing}>
		{testing ? 'Testing…' : 'Test connection'}
	</Button>
	<Button onclick={onsave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
</div>
