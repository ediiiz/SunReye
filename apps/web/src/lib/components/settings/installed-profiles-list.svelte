<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import GroupedProfileList from "./grouped-profile-list.svelte";
	import SettingsSection from "./settings-section.svelte";
	import StatusBadge from "./status-badge.svelte";
	import type { RegisteredProfile } from "./profile-types";
	import * as m from "$lib/paraglide/messages";

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
					<StatusBadge ok label={m.profiles_active()} />
				{/if}
				{#if pending}
					<Badge
						variant="outline"
						class="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
					>
						<span class="mr-1.5 inline-block size-1.5 rounded-full bg-amber-500"></span>
						{m.profiles_restart_to_activate()}
					</Badge>
				{/if}
				{#if p.builtin}
					<StatusBadge label={m.badge_builtin()} />
				{/if}
			</span>
			<span class="text-xs text-muted-foreground">
				{p.manufacturer}{p.version ? ` · v${p.version}` : ""}
				· {p.builtin ? m.profiles_builtin() : m.profiles_downloaded()}
			</span>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if pending}
				<Button size="sm" class="flex-1 sm:flex-none" onclick={onRestart}>{m.profiles_restart_short()}</Button>
			{:else if !p.active}
				<Button
					variant="outline"
					size="sm"
					class="flex-1 sm:flex-none"
					disabled={busyId === p.id}
					onclick={() => onSetActive(p)}
				>
					{m.profiles_set_active()}
				</Button>
				{#if p.installed}
					<Button
						variant="ghost"
						size="sm"
						class="flex-1 sm:flex-none"
						disabled={busyId === p.id}
						onclick={() => onUninstall(p)}
					>
						{m.action_remove()}
					</Button>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

<SettingsSection title={m.profiles_installed_title()}>
	<GroupedProfileList
		{profiles}
		row={profileRow}
		exclude={(p) => p.active}
		emptyLabel={m.profiles_none_other()}
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
