<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import WarningIcon from 'phosphor-svelte/lib/Warning';

	// Must match RESET_DATA_CONFIRM on the server (apps/server/src/maintenance.ts):
	// the user types it to arm the wipe, and the server re-checks it.
	const CONFIRM_PHRASE = 'DELETE ALL DATA';

	let open = $state(false);
	let phrase = $state('');
	let busy = $state(false);

	const armed = $derived(phrase.trim() === CONFIRM_PHRASE);

	async function reset() {
		if (!armed) return;
		busy = true;
		const { error } = await api.api.admin['reset-data'].post({ confirm: phrase.trim() });
		busy = false;
		if (error) {
			toast.error(
				(error.value as { error?: string })?.error ?? 'Failed to reset data'
			);
			return;
		}
		toast.success('All measurement data cleared. Fresh data will appear as polling resumes.');
		open = false;
		phrase = '';
	}
</script>

<section class="flex flex-col gap-4 border border-destructive/50 p-4">
	<div class="flex items-center gap-2 text-destructive">
		<WarningIcon class="size-4" weight="fill" />
		<h2 class="text-sm font-medium uppercase tracking-wide">Danger zone</h2>
	</div>

	<div class="flex flex-col gap-1">
		<p class="text-sm font-medium">Reset all data</p>
		<p class="text-sm text-muted-foreground">
			Permanently delete every recorded measurement — the raw history and all rollups behind the
			charts and cost pages — so the instance starts fresh. Accounts, settings, tariff, and
			profiles are kept. This cannot be undone.
		</p>
	</div>

	<div>
		<Button variant="destructive" onclick={() => (open = true)}>Reset all data…</Button>
	</div>
</section>

<Dialog.Root
	bind:open
	onOpenChange={(o) => {
		if (!o) phrase = '';
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Reset all data?</Dialog.Title>
			<Dialog.Description>
				This permanently deletes all recorded measurements and cannot be undone. Type
				<span class="font-mono font-medium text-foreground">{CONFIRM_PHRASE}</span> to confirm.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-1.5">
			<Label for="reset-confirm">Confirmation</Label>
			<Input
				id="reset-confirm"
				bind:value={phrase}
				autocomplete="off"
				placeholder={CONFIRM_PHRASE}
			/>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button variant="destructive" onclick={reset} disabled={!armed || busy}>
				{busy ? 'Resetting…' : 'Delete everything'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
