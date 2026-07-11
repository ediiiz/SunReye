<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import SettingsSection from "./settings-section.svelte";
	import StatusBadge from "./status-badge.svelte";
	import type { RegisteredProfile } from "./profile-types";

	let {
		profiles,
		busyId,
		onSetActive,
		onUninstall
	}: {
		profiles: RegisteredProfile[];
		busyId: string | null;
		onSetActive: (p: RegisteredProfile) => void;
		onUninstall: (p: RegisteredProfile) => void;
	} = $props();
</script>

<SettingsSection title="Installed profiles">
	<div class="flex flex-col divide-y divide-border">
		{#each profiles as p (p.id)}
			<div class="flex items-center justify-between gap-4 py-2.5">
				<div class="flex flex-col">
					<span class="flex items-center gap-2 text-sm font-medium">
						{p.name}
						{#if p.active}
							<StatusBadge ok label="Active" />
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
				<div class="flex items-center gap-2">
					{#if !p.active}
						<Button
							variant="outline"
							size="sm"
							disabled={busyId === p.id}
							onclick={() => onSetActive(p)}
						>
							Set active
						</Button>
					{/if}
					{#if p.installed && !p.active}
						<Button
							variant="ghost"
							size="sm"
							disabled={busyId === p.id}
							onclick={() => onUninstall(p)}
						>
							Remove
						</Button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</SettingsSection>
