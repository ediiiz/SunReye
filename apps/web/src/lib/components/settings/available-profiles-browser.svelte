<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import SettingsSection from "./settings-section.svelte";
	import StatusBadge from "./status-badge.svelte";
	import type { AvailableProfile } from "./profile-types";

	let {
		available,
		errors,
		browsing,
		busyId,
		onBrowse,
		onInstall
	}: {
		available: AvailableProfile[] | null;
		errors: { source: string; error: string }[];
		browsing: boolean;
		busyId: string | null;
		onBrowse: () => void;
		onInstall: (p: AvailableProfile) => void;
	} = $props();
</script>

<SettingsSection title="Available profiles">
	{#snippet actions()}
		<Button variant="outline" size="sm" disabled={browsing} onclick={onBrowse}>
			{browsing ? "Browsing…" : "Browse repositories"}
		</Button>
	{/snippet}

	{#each errors as e (e.source)}
		<p class="text-xs text-destructive">Could not read {e.source}: {e.error}</p>
	{/each}

	{#if available === null}
		<p class="text-sm text-muted-foreground">
			Browse your repositories to see profiles you can download.
		</p>
	{:else if available.length === 0}
		<p class="text-sm text-muted-foreground">No profiles found in the enabled repositories.</p>
	{:else}
		<div class="flex flex-col divide-y divide-border">
			{#each available as p (p.source + p.id)}
				<div class="flex items-center justify-between gap-4 py-2.5">
					<div class="flex min-w-0 flex-col">
						<span class="text-sm font-medium">{p.name}</span>
						<span class="truncate text-xs text-muted-foreground">
							{p.manufacturer} · v{p.version}{p.description ? ` · ${p.description}` : ""}
						</span>
					</div>
					<div class="shrink-0">
						{#if p.updateAvailable}
							<Button size="sm" disabled={busyId === p.id} onclick={() => onInstall(p)}>
								Update to v{p.version}
							</Button>
						{:else if p.installed}
							<StatusBadge ok label={`Installed v${p.installedVersion}`} />
						{:else}
							<Button size="sm" disabled={busyId === p.id} onclick={() => onInstall(p)}>
								Download
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</SettingsSection>
