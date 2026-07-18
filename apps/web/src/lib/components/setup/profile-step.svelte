<script lang="ts">
	import Check from 'phosphor-svelte/lib/Check';
	import Plus from 'phosphor-svelte/lib/Plus';
	import { prefersReducedMotion } from 'svelte/motion';
	import { scale } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import ExternalProfilesManager from '$lib/components/settings/external-profiles-manager.svelte';
	import GroupedProfileList from '$lib/components/settings/grouped-profile-list.svelte';
	import StatusBadge from '$lib/components/settings/status-badge.svelte';
	import type { RegisteredProfile } from '$lib/components/settings/profile-types';
	import * as m from '$lib/paraglide/messages';

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

{#snippet profileRow(p: RegisteredProfile)}
	{@const selected = p.id === selectedId}
	<div class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<span class="flex flex-wrap items-center gap-1.5 text-sm font-medium">
				<span class="wrap-break-word">{p.name}</span>
				{#if p.builtin}
					<StatusBadge label={m.badge_builtin()} />
				{/if}
			</span>
			<span class="text-xs text-muted-foreground">
				{p.manufacturer}{p.version ? ` · v${p.version}` : ''}
			</span>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<!-- Same element across states so the outline→solid colour change tweens. -->
			<Button
				variant={selected ? 'default' : 'outline'}
				size="sm"
				class="min-w-24 flex-1 sm:flex-none"
				aria-pressed={selected}
				onclick={() => (selectedId = p.id)}
			>
				{#if selected}
					<span
						in:scale={{ duration: prefersReducedMotion.current ? 0 : 150, start: 0.4 }}
						class="flex items-center"
					>
						<Check class="size-4" weight="bold" />
					</span>
					{m.profile_selected()}
				{:else}
					{m.profile_select()}
				{/if}
			</Button>
		</div>
	</div>
{/snippet}

<section class="flex flex-col gap-4 border border-border p-4">
	<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
		{m.setup_select_profile()}
	</h2>

	<GroupedProfileList {profiles} row={profileRow} emptyLabel={m.setup_no_profiles()} />

	<Collapsible.Root bind:open={showSources}>
		<div class="flex flex-col gap-3 border border-dashed border-border p-4">
			<div class="flex flex-col gap-1">
				<p class="text-sm font-medium">{m.setup_no_inverter_q()}</p>
				<p class="text-xs text-muted-foreground">{m.setup_download_more()}</p>
			</div>
			<Collapsible.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="w-full sm:w-auto" {...props}>
						<Plus class="size-4" />
						{showSources ? m.setup_hide_sources() : m.setup_add_source()}
					</Button>
				{/snippet}
			</Collapsible.Trigger>
		</div>
		<Collapsible.Content class="mt-4">
			<ExternalProfilesManager onInstalled={onExternalInstalled} />
		</Collapsible.Content>
	</Collapsible.Root>

	<div class="flex justify-end">
		<Button disabled={!selectedId} onclick={onContinue}>{m.action_continue()}</Button>
	</div>
</section>
