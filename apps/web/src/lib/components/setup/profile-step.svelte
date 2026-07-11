<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import ExternalProfilesManager from '$lib/components/settings/external-profiles-manager.svelte';
	import StatusBadge from '$lib/components/settings/status-badge.svelte';
	import type { RegisteredProfile } from '$lib/components/settings/profile-types';

	let {
		profiles,
		selectedId = $bindable(),
		onContinue,
		onExternalInstalled
	}: {
		profiles: RegisteredProfile[];
		selectedId: string | null;
		onContinue: () => void;
		onExternalInstalled: (id: string) => void;
	} = $props();

	let showSources = $state(false);
</script>

<section class="flex flex-col gap-4 border border-border p-4">
	<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Select a profile</h2>

	{#if profiles.length === 0}
		<p class="text-sm text-muted-foreground">
			No profiles available. Add an external source below to download one.
		</p>
	{:else}
		<div class="flex flex-col divide-y divide-border">
			{#each profiles as p (p.id)}
				<button
					type="button"
					class="flex items-center justify-between gap-4 py-2.5 text-left {selectedId === p.id
						? ''
						: 'opacity-80 hover:opacity-100'}"
					onclick={() => (selectedId = p.id)}
				>
					<div class="flex flex-col">
						<span class="flex items-center gap-2 text-sm font-medium">
							{p.name}
							{#if p.builtin}
								<StatusBadge label="Built in" />
							{/if}
						</span>
						<span class="text-xs text-muted-foreground">
							{p.manufacturer}{p.version ? ` · v${p.version}` : ''}
						</span>
					</div>
					<span
						class="inline-block size-4 shrink-0 rounded-full border-2 {selectedId === p.id
							? 'border-primary bg-primary'
							: 'border-muted-foreground'}"
						aria-hidden="true"
					></span>
				</button>
			{/each}
		</div>
	{/if}

	<Collapsible.Root bind:open={showSources}>
		<Collapsible.Trigger>
			{#snippet child({ props })}
				<Button variant="ghost" size="sm" {...props}>
					{showSources ? 'Hide external sources' : 'Add an external profile source'}
				</Button>
			{/snippet}
		</Collapsible.Trigger>
		<Collapsible.Content class="mt-4">
			<ExternalProfilesManager onInstalled={onExternalInstalled} />
		</Collapsible.Content>
	</Collapsible.Root>

	<div class="flex justify-end">
		<Button disabled={!selectedId} onclick={onContinue}>Continue</Button>
	</div>
</section>
