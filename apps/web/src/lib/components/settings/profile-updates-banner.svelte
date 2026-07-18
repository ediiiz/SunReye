<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import type { ProfileUpdate } from "./profile-types";
	import * as m from "$lib/paraglide/messages";

	let {
		updates,
		busyId,
		onUpdate
	}: {
		updates: ProfileUpdate[];
		/** Id of the profile currently being updated, if any. */
		busyId: string | null;
		onUpdate: (u: ProfileUpdate) => void;
	} = $props();
</script>

{#if updates.length > 0}
	<div
		class="flex flex-col gap-3 border border-sky-500/50 bg-sky-500/10 p-3 text-sm text-sky-700 dark:text-sky-400"
	>
		<span class="flex items-center gap-2 font-medium">
			<span class="inline-block size-2 shrink-0 rounded-full bg-sky-500"></span>
			{updates.length === 1
				? m.profiles_updates_available_one({ count: updates.length })
				: m.profiles_updates_available_other({ count: updates.length })}
		</span>
		<div class="flex flex-col divide-y divide-sky-500/20">
			{#each updates as u (u.source + u.id)}
				<div
					class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
				>
					<span class="flex min-w-0 flex-col">
						<span class="wrap-break-word text-foreground">{u.name}</span>
						<span class="text-xs text-muted-foreground">
							v{u.installedVersion} → v{u.latestVersion}
						</span>
					</span>
					<Button
						size="sm"
						variant="outline"
						class="w-full sm:w-auto"
						disabled={busyId === u.id}
						onclick={() => onUpdate(u)}
					>
						{m.profiles_update_to({ version: u.latestVersion })}
					</Button>
				</div>
			{/each}
		</div>
	</div>
{/if}
