<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import GroupedProfileList from "./grouped-profile-list.svelte";
	import SettingsSection from "./settings-section.svelte";
	import StatusBadge from "./status-badge.svelte";
	import type { RegisteredProfile } from "./profile-types";

	let {
		profiles,
		busyId,
		pendingActiveId,
		onSetActive,
		onUninstall,
		onRestart
	}: {
		profiles: RegisteredProfile[];
		busyId: string | null;
		/** Profile queued to become active on the next restart, if any. */
		pendingActiveId: string | null;
		onSetActive: (p: RegisteredProfile) => void;
		onUninstall: (p: RegisteredProfile) => void;
		onRestart: () => void;
	} = $props();

	// The active profile is pinned to the top and never hidden by search.
	const activeProfile = $derived(profiles.find((p) => p.active));
</script>

{#snippet profileRow(p: RegisteredProfile)}
	{@const pending = p.id === pendingActiveId}
	<div class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<span class="flex flex-wrap items-center gap-1.5 text-sm font-medium">
				<span class="wrap-break-word">{p.name}</span>
				{#if p.active}
					<StatusBadge ok label="Active" />
				{/if}
				{#if pending}
					<Badge
						variant="outline"
						class="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
					>
						<span class="mr-1.5 inline-block size-1.5 rounded-full bg-amber-500"></span>
						Restart to activate
					</Badge>
				{/if}
				{#if p.builtin}
					<StatusBadge label="Built in" />
				{/if}
			</span>
			<span class="text-xs text-muted-foreground">
				{p.manufacturer}{p.version ? ` · v${p.version}` : ""}
				{p.builtin ? " · built-in" : " · downloaded"}
			</span>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if pending}
				<Button size="sm" class="flex-1 sm:flex-none" onclick={onRestart}>Restart</Button>
			{:else if !p.active}
				<Button
					variant="outline"
					size="sm"
					class="flex-1 sm:flex-none"
					disabled={busyId === p.id}
					onclick={() => onSetActive(p)}
				>
					Set active
				</Button>
				{#if p.installed}
					<Button
						variant="ghost"
						size="sm"
						class="flex-1 sm:flex-none"
						disabled={busyId === p.id}
						onclick={() => onUninstall(p)}
					>
						Remove
					</Button>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

<SettingsSection title="Installed profiles">
	<GroupedProfileList
		{profiles}
		row={profileRow}
		exclude={(p) => p.active}
		emptyLabel="No other profiles installed."
	>
		{#snippet pinned()}
			{#if activeProfile}
				<div class="border border-border bg-muted/40 px-3">
					{@render profileRow(activeProfile)}
				</div>
			{/if}
		{/snippet}
	</GroupedProfileList>
</SettingsSection>
