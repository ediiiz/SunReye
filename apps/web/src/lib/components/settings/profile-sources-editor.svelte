<script lang="ts">
	import { toast } from "svelte-sonner";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Switch } from "$lib/components/ui/switch";
	import SettingsSection from "./settings-section.svelte";
	import type { Source } from "./profile-types";

	let {
		sources,
		saving,
		onAdd,
		onRemove,
		onToggle
	}: {
		sources: Source[];
		saving: boolean;
		onAdd: (url: string) => void;
		onRemove: (url: string) => void;
		onToggle: (url: string, enabled: boolean) => void;
	} = $props();

	let newUrl = $state("");

	// Mirror the server's `gitUrlSchema` so invalid URLs are caught before we
	// optimistically add + auto-save them (the server would otherwise reject the
	// whole set with an opaque 400).
	function validationError(url: string): string | null {
		if (!url.startsWith("https://")) return "URL must be an https git URL";
		return null;
	}

	function add() {
		const url = newUrl.trim();
		if (!url) return;
		if (sources.some((s) => s.url === url)) {
			toast.error("That source is already added");
			return;
		}
		const error = validationError(url);
		if (error) {
			toast.error(error);
			return;
		}
		onAdd(url);
		newUrl = "";
	}
</script>

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
					<Switch
						checked={s.enabled}
						disabled={saving}
						onCheckedChange={(checked) => onToggle(s.url, checked)}
						aria-label="Enabled"
					/>
					{#if s.official}
						<!-- Protected: the official source can be disabled but not removed. -->
						<span class="text-xs uppercase tracking-wide text-muted-foreground">Default</span>
					{:else}
						<Button variant="ghost" size="sm" disabled={saving} onclick={() => onRemove(s.url)}>
							Remove
						</Button>
					{/if}
				</div>
			</div>
		{/each}
		{#if sources.length === 0}
			<p class="py-2.5 text-sm text-muted-foreground">No repositories configured.</p>
		{/if}
	</div>
	<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
		<div class="flex min-w-0 flex-1 flex-col gap-1.5">
			<Label for="new-source">Add repository (https git URL)</Label>
			<Input
				id="new-source"
				bind:value={newUrl}
				disabled={saving}
				placeholder="https://github.com/org/inverter-profiles.git"
				onkeydown={(e) => e.key === "Enter" && add()}
			/>
		</div>
		<Button variant="outline" class="w-full sm:w-auto" disabled={saving} onclick={add}>Add</Button>
	</div>
</SettingsSection>
