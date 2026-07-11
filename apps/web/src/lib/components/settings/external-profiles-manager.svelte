<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import AvailableProfilesBrowser from './available-profiles-browser.svelte';
	import ProfileSourcesEditor from './profile-sources-editor.svelte';
	import type { AvailableProfile, Source } from './profile-types';

	// Self-contained "add an external profile" surface: manage git repo sources,
	// browse them, and download a profile. Shared by the settings profiles form
	// and the first-run setup wizard so the source/browse/install flow lives once.
	// `onInstalled` fires with the downloaded id so the parent can refresh its
	// registered list (and, in settings, flag a required restart).
	let { onInstalled }: { onInstalled?: (id: string) => void } = $props();

	let sources = $state<Source[]>([]);
	let available = $state<AvailableProfile[] | null>(null);
	let browseErrors = $state<{ source: string; error: string }[]>([]);
	let savingSources = $state(false);
	let browsing = $state(false);
	let busyId = $state<string | null>(null);

	onMount(loadSources);

	async function loadSources() {
		const { data } = await api.api.settings['profile-sources'].get();
		if (data) sources = data.sources;
	}
	function addSource(url: string) {
		sources = [...sources, { url, enabled: true }];
	}
	function removeSource(url: string) {
		sources = sources.filter((s) => s.url !== url);
	}
	async function saveSources() {
		savingSources = true;
		const { error } = await api.api.settings['profile-sources'].put({ sources });
		savingSources = false;
		if (error) toast.error(`Failed to save sources: ${String(error.value)}`);
		else toast.success('Profile sources saved');
	}
	async function browse() {
		browsing = true;
		available = null;
		browseErrors = [];
		const { data, error } = await api.api.profiles.available.get();
		browsing = false;
		if (error || !data) {
			toast.error('Failed to browse profiles');
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
		toast.success(`Downloaded ${p.name}`);
		onInstalled?.(p.id);
		await browse();
	}
</script>

<div class="flex flex-col gap-4">
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
