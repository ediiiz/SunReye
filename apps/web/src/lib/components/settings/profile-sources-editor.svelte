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
		onSave
	}: {
		sources: Source[];
		saving: boolean;
		onAdd: (url: string) => void;
		onRemove: (url: string) => void;
		onSave: () => void;
	} = $props();

	let newUrl = $state("");

	function add() {
		const url = newUrl.trim();
		if (!url) return;
		if (sources.some((s) => s.url === url)) {
			toast.error("That source is already added");
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
					<Switch bind:checked={s.enabled} aria-label="Enabled" />
					<Button variant="ghost" size="sm" onclick={() => onRemove(s.url)}>Remove</Button>
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
		<Button variant="outline" onclick={add}>Add</Button>
	</div>
	<div>
		<Button disabled={saving} onclick={onSave}>
			{saving ? "Saving…" : "Save repositories"}
		</Button>
	</div>
</SettingsSection>
