<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import ExternalProfilesManager from "./external-profiles-manager.svelte";
	import InstalledProfilesList from "./installed-profiles-list.svelte";
	import ProfileUpdatesBanner from "./profile-updates-banner.svelte";
	import RestartButton from "./restart-button.svelte";
	import type { ProfileUpdate, RegisteredProfile } from "./profile-types";

	let registered = $state<RegisteredProfile[]>([]);
	let updates = $state<ProfileUpdate[]>([]);
	let restartRequired = $state(false);
	let busyId = $state<string | null>(null);
	/** Profile queued to become active once the server restarts, if any. */
	let pendingActiveId = $state<string | null>(null);
	let restartOpen = $state(false);

	const pendingProfile = $derived(registered.find((p) => p.id === pendingActiveId));

	async function loadRegistered() {
		const { data } = await api.api.profiles.get();
		if (data) registered = data as RegisteredProfile[];
	}

	async function loadUpdates() {
		// Cached result of the server's background update checker (semver-aware).
		const { data } = await api.api.profiles.updates.get();
		if (data) updates = data.updates as ProfileUpdate[];
	}

	onMount(() => {
		void loadRegistered();
		void loadUpdates();
	});

	async function onExternalInstalled() {
		// The server registers a downloaded profile immediately, so it shows in the
		// installed list right away — no restart needed just to download. Applying
		// it (Set active) is what requires a restart.
		await Promise.all([loadRegistered(), loadUpdates()]);
	}

	async function updateProfile(u: ProfileUpdate) {
		busyId = u.id;
		const { error } = await api.api.profiles.install.post({ source: u.source, id: u.id });
		busyId = null;
		if (error) {
			toast.error(`Update failed: ${String(error.value)}`);
			return;
		}
		toast.success(`Updated ${u.name} to v${u.latestVersion}`);
		restartRequired = true;
		updates = updates.filter((x) => x.id !== u.id);
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
		pendingActiveId = p.id;
		toast.success(`${p.name} will be active after restart`);
	}
</script>

<div class="flex flex-col gap-6">
	<ProfileUpdatesBanner {updates} {busyId} onUpdate={updateProfile} />

	{#if restartRequired && !pendingActiveId}
		<div
			class="flex flex-col gap-3 border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 sm:flex-row sm:items-center sm:gap-2 dark:text-amber-400"
		>
			<span class="flex items-center gap-2">
				<span class="inline-block size-2 shrink-0 rounded-full bg-amber-500"></span>
				<span>Restart required to apply profile changes.</span>
			</span>
			<div class="sm:ml-auto">
				<Button
					size="sm"
					variant="outline"
					class="w-full sm:w-auto"
					onclick={() => (restartOpen = true)}
				>
					Restart now
				</Button>
			</div>
		</div>
	{/if}

	<InstalledProfilesList
		profiles={registered}
		{busyId}
		{pendingActiveId}
		onSetActive={setActive}
		onUninstall={uninstall}
		onRestart={() => (restartOpen = true)}
	/>

	<ExternalProfilesManager onInstalled={onExternalInstalled} />
</div>

<Dialog.Root bind:open={restartOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Restart to apply changes?</Dialog.Title>
			<Dialog.Description>
				{#if pendingProfile}
					The server will restart to activate
					<span class="font-medium text-foreground">{pendingProfile.name}</span>. Polling and
					live data pause briefly while it comes back.
				{:else}
					The server will restart to apply your profile changes. Polling and live data pause
					briefly while it comes back.
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (restartOpen = false)}>Cancel</Button>
			<RestartButton label="Restart now" />
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
