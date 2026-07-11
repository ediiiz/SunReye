<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import RestartButton from '$lib/components/settings/restart-button.svelte';

	let {
		profileName,
		activating,
		activated,
		onActivate,
		onBack
	}: {
		profileName: string | undefined;
		activating: boolean;
		activated: boolean;
		onActivate: () => void;
		onBack: () => void;
	} = $props();
</script>

<section class="flex flex-col gap-4 border border-border p-4">
	<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Activate profile</h2>

	{#if activated}
		<div
			class="flex items-start gap-2 border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400"
		>
			<span class="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-amber-500"></span>
			<div class="flex flex-col gap-1">
				<span class="font-medium">{profileName} activated — restart the server to finish.</span>
				<span>
					The active profile shapes the API, manifest, and topics built once at boot, so it takes
					effect on the next restart.
				</span>
			</div>
		</div>
		<div class="flex items-center justify-end gap-2">
			<Button variant="ghost" onclick={() => location.reload()}>I've restarted — reload</Button>
			<RestartButton label="Restart now" />
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">
			Activate <span class="font-medium text-foreground">{profileName}</span> as this instance's
			inverter. This takes effect after the next server restart.
		</p>
		<div class="flex justify-between">
			<Button variant="ghost" onclick={onBack}>Back</Button>
			<Button disabled={activating} onclick={onActivate}>
				{activating ? 'Activating…' : 'Activate profile'}
			</Button>
		</div>
	{/if}
</section>
