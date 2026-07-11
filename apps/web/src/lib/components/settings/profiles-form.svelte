<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import { api } from "$lib/api";
	import ExternalProfilesManager from "./external-profiles-manager.svelte";
	import InstalledProfilesList from "./installed-profiles-list.svelte";
	import RestartButton from "./restart-button.svelte";
	import type { RegisteredProfile } from "./profile-types";

	let registered = $state<RegisteredProfile[]>([]);
	let restartRequired = $state(false);
	let busyId = $state<string | null>(null);

	async function loadRegistered() {
		const { data } = await api.api.profiles.get();
		if (data) registered = data as RegisteredProfile[];
	}

	onMount(loadRegistered);

	async function onExternalInstalled() {
		// A downloaded profile is only registered/selectable after a restart.
		restartRequired = true;
		await loadRegistered();
	}

	async function uninstall(p: RegisteredProfile) {
		busyId = p.id;
		const { error } = await api.api.profiles({ id: p.id }).delete();
		busyId = null;
		if (error) {
			toast.error(`Uninstall failed: ${String(error.value)}`);
			return;
		}
		toast.success(`Uninstalled ${p.name}`);
		await loadRegistered();
	}

	async function setActive(p: RegisteredProfile) {
		busyId = p.id;
		const { data, error } = await api.api.settings["active-profile"].put({ id: p.id });
		busyId = null;
		if (error || !data) {
			toast.error("Failed to set active profile");
			return;
		}
		restartRequired = data.restartRequired;
		toast.success(`${p.name} will be active after restart`);
	}
</script>

<div class="flex flex-col gap-6">
	{#if restartRequired}
		<div
			class="flex items-center gap-2 border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400"
		>
			<span class="inline-block size-2 rounded-full bg-amber-500"></span>
			<span>Restart required to apply profile changes.</span>
			<div class="ml-auto">
				<RestartButton label="Restart now" size="sm" variant="outline" />
			</div>
		</div>
	{/if}

	<InstalledProfilesList
		profiles={registered}
		{busyId}
		onSetActive={setActive}
		onUninstall={uninstall}
	/>

	<ExternalProfilesManager onInstalled={onExternalInstalled} />
</div>
