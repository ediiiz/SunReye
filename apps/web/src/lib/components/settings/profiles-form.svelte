<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Switch } from "$lib/components/ui/switch";
	import SettingsSection from "./settings-section.svelte";
	import StatusBadge from "./status-badge.svelte";

	type RegisteredProfile = {
		id: string;
		name: string;
		manufacturer: string;
		active: boolean;
		installed: boolean;
		version?: string;
	};
	type Source = { url: string; label?: string; enabled: boolean };
	type AvailableProfile = {
		id: string;
		name: string;
		manufacturer: string;
		version: string;
		path: string;
		description?: string;
		source: string;
		installed: boolean;
		installedVersion?: string;
		updateAvailable: boolean;
	};

	let registered = $state<RegisteredProfile[]>([]);
	let sources = $state<Source[]>([]);
	let available = $state<AvailableProfile[] | null>(null);
	let browseErrors = $state<{ source: string; error: string }[]>([]);

	let newUrl = $state("");
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

	function addSource() {
		const url = newUrl.trim();
		if (!url) return;
		if (sources.some((s) => s.url === url)) {
			toast.error("That source is already added");
			return;
		}
		sources = [...sources, { url, enabled: true }];
		newUrl = "";
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

	<!-- Active profile picker -->
	<SettingsSection title="Installed profiles">
		<div class="flex flex-col divide-y divide-border">
			{#each registered as p (p.id)}
				<div class="flex items-center justify-between gap-4 py-2.5">
					<div class="flex flex-col">
						<span class="flex items-center gap-2 text-sm font-medium">
							{p.name}
							{#if p.active}
								<StatusBadge ok label="Active" />
							{/if}
						</span>
						<span class="text-xs text-muted-foreground">
							{p.manufacturer}{p.version ? ` · v${p.version}` : ""}
							{p.installed ? " · downloaded" : " · built-in"}
						</span>
					</div>
					<div class="flex items-center gap-2">
						{#if !p.active}
							<Button
								variant="outline"
								size="sm"
								disabled={busyId === p.id}
								onclick={() => setActive(p)}
							>
								Set active
							</Button>
						{/if}
						{#if p.installed && !p.active}
							<Button
								variant="ghost"
								size="sm"
								disabled={busyId === p.id}
								onclick={() => uninstall(p)}
							>
								Remove
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</SettingsSection>

	<!-- Repo sources -->
	<SettingsSection title="Profile repositories">
		<div class="flex flex-col divide-y divide-border">
			{#each sources as s (s.url)}
				<div class="flex items-center justify-between gap-4 py-2.5">
					<div class="flex min-w-0 flex-col">
						<span class="truncate text-sm">{s.label ?? s.url}</span>
						{#if s.label}
							<span class="truncate text-xs text-muted-foreground">{s.url}</span>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-3">
						<Switch bind:checked={s.enabled} aria-label="Enabled" />
						<Button variant="ghost" size="sm" onclick={() => removeSource(s.url)}>Remove</Button>
					</div>
				</div>
			{/each}
			{#if sources.length === 0}
				<p class="py-2.5 text-sm text-muted-foreground">No repositories configured.</p>
			{/if}
		</div>
		<div class="flex items-end gap-2">
			<div class="flex flex-1 flex-col gap-1.5">
				<Label for="new-source">Add repository (https git URL)</Label>
				<Input
					id="new-source"
					bind:value={newUrl}
					placeholder="https://github.com/org/inverter-profiles.git"
				/>
			</div>
			<Button variant="outline" onclick={addSource}>Add</Button>
		</div>
		<div>
			<Button disabled={savingSources} onclick={saveSources}>
				{savingSources ? "Saving…" : "Save repositories"}
			</Button>
		</div>
	</SettingsSection>

	<!-- Browse & download -->
	<SettingsSection title="Available profiles">
		{#snippet actions()}
			<Button variant="outline" size="sm" disabled={browsing} onclick={browse}>
				{browsing ? "Browsing…" : "Browse repositories"}
			</Button>
		{/snippet}

		{#each browseErrors as e (e.source)}
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
								<Button size="sm" disabled={busyId === p.id} onclick={() => install(p)}>
									Update to v{p.version}
								</Button>
							{:else if p.installed}
								<StatusBadge ok label={`Installed v${p.installedVersion}`} />
							{:else}
								<Button size="sm" disabled={busyId === p.id} onclick={() => install(p)}>
									Download
								</Button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</SettingsSection>
</div>
