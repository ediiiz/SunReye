<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { repoLabel } from "./repo-label";
	import StatusBadge from "./status-badge.svelte";
	import type { AvailableProfile, Source } from "./profile-types";

	let {
		profile,
		sources,
		busyId,
		onInstall
	}: {
		profile: AvailableProfile;
		sources: Source[];
		busyId: string | null;
		onInstall: (p: AvailableProfile) => void;
	} = $props();

	const source = $derived(repoLabel(profile.source, sources));
</script>

<div class="flex items-center justify-between gap-4 py-2.5">
	<div class="flex min-w-0 flex-col">
		<span class="wrap-break-word text-sm font-medium">{profile.name}</span>
		<span class="truncate text-xs text-muted-foreground">
			{profile.manufacturer} · v{profile.version}{profile.description
				? ` · ${profile.description}`
				: ""} · {source}
		</span>
	</div>
	<div class="shrink-0">
		{#if profile.updateAvailable}
			<Button size="sm" disabled={busyId === profile.id} onclick={() => onInstall(profile)}>
				Update to v{profile.version}
			</Button>
		{:else if profile.installed}
			<StatusBadge ok label={`Installed v${profile.installedVersion}`} />
		{:else}
			<Button size="sm" disabled={busyId === profile.id} onclick={() => onInstall(profile)}>
				Download
			</Button>
		{/if}
	</div>
</div>
