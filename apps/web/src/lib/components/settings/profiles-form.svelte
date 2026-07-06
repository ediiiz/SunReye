<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import { api } from "$lib/api";
	import AvailableProfilesBrowser from "./available-profiles-browser.svelte";
	import InstalledProfilesList from "./installed-profiles-list.svelte";
	import ProfileSourcesEditor from "./profile-sources-editor.svelte";
	import type { AvailableProfile, RegisteredProfile, Source } from "./profile-types";

	let registered = $state<RegisteredProfile[]>([]);
	let sources = $state<Source[]>([]);
	let available = $state<AvailableProfile[] | null>(null);
	let browseErrors = $state<{ source: string; error: string }[]>([]);

	let savingSources = $state(false);
	let browsing = $state(false);
	let restartRequired = $state(false);
	let busyId = $state<string | null>(null);

	async function loadRegistered() {
		const { data } = await api.api.profiles.get();
		if (data) registered = data as RegisteredProfile[];
	}
	async function loadSources() {
		const { data } = await api.api.settings["profile-sources"].get();
		if (data) sources = data.sources;
	}

	onMount(async () => {
		await Promise.all([loadRegistered(), loadSources()]);
	});

	function addSource(url: string) {
		sources = [...sources, { url, enabled: true }];
	}

	function removeSource(url: string) {
		sources = sources.filter((s) => s.url !== url);
	}

	async function saveSources() {
		savingSources = true;
		const { error } = await api.api.settings["profile-sources"].put({ sources });
		savingSources = false;
		if (error) toast.error(`Failed to save sources: ${String(error.value)}`);
		else toast.success("Profile sources saved");
	}

	async function browse() {
		browsing = true;
		available = null;
		browseErrors = [];
		const { data, error } = await api.api.profiles.available.get();
		browsing = false;
		if (error || !data) {
			toast.error("Failed to browse profiles");
			return;
		}
		available = data.profiles as AvailableProfile[];
		browseErrors = data.errors;
	}

	async function install(p: AvailableProfile) {
		busyId = p.id;
		const { error } = await api.api.profiles.install.post({ source: p.source, id: p.id });
		busyId = null;
		if (error) {
			toast.error(`Install failed: ${String(error.value)}`);
			return;
		}
		toast.success(`Installed ${p.name} — restart to load`);
		restartRequired = true;
		await Promise.all([loadRegistered(), browse()]);
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
		if (available) await browse();
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
			Restart required to apply profile changes.
		</div>
	{/if}

	<InstalledProfilesList
		profiles={registered}
		{busyId}
		onSetActive={setActive}
		onUninstall={uninstall}
	/>

	<ProfileSourcesEditor
		{sources}
		saving={savingSources}
		onAdd={addSource}
		onRemove={removeSource}
		onSave={saveSources}
	/>

	<AvailableProfilesBrowser
		{available}
		errors={browseErrors}
		{browsing}
		{busyId}
		onBrowse={browse}
		onInstall={install}
	/>
</div>
