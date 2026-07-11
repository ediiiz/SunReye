<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { restartServer } from '$lib/setup';

	// Triggers a supervised server restart and waits for it to come back (then the
	// page reloads). Shared by the onboarding activate step and the settings
	// "restart required" banner.
	let {
		label = 'Restart server',
		variant = 'default',
		size = 'default'
	}: {
		label?: string;
		variant?: 'default' | 'outline' | 'ghost';
		size?: 'default' | 'sm';
	} = $props();

	let restarting = $state(false);

	async function restart() {
		restarting = true;
		const ok = await restartServer();
		// On success the page reloads, so we only reach here on failure.
		restarting = false;
		if (!ok) toast.error('Server did not come back — restart the process manually, then reload.');
	}
</script>

<Button {variant} {size} disabled={restarting} onclick={restart}>
	{restarting ? 'Restarting…' : label}
</Button>
