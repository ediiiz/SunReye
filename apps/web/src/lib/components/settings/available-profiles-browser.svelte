<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import AvailableProfileGroup from "./available-profile-group.svelte";
	import SettingsSection from "./settings-section.svelte";
	import type { AvailableProfile, ManufacturerGroup } from "./profile-types";

	let {
		available,
		errors,
		browsing,
		busyId,
		onBrowse,
		onInstall
	}: {
		available: AvailableProfile[] | null;
		errors: { source: string; error: string }[];
		browsing: boolean;
		busyId: string | null;
		onBrowse: () => void;
		onInstall: (p: AvailableProfile) => void;
	} = $props();

	// A build-time `defineFamily` emits a base profile plus per-SKU models that all
	// share the base id's trailing segment (`deye-sg05lp3`, `deye-sun14k-sg05lp3` →
	// `sg05lp3`). The built output drops the family link, so recover it from the id.
	function familyKey(id: string): string {
		const i = id.lastIndexOf("-");
		return i === -1 ? id : id.slice(i + 1);
	}

	// Numeric-aware so "SUN-5K" sorts before "SUN-10K" (plain order puts "10" first).
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

	const groups = $derived.by((): ManufacturerGroup[] => {
		const byManufacturer: Record<string, Record<string, AvailableProfile[]>> = {};
		for (const p of available ?? []) {
			const manufacturer = p.manufacturer || "Other";
			const families = (byManufacturer[manufacturer] ??= {});
			(families[familyKey(p.id)] ??= []).push(p);
		}
		return Object.entries(byManufacturer)
			.map(([manufacturer, families]) => {
				const familyGroups = Object.entries(families)
					.map(([key, profiles]) => ({
						key,
						label: key.toUpperCase(),
						profiles: profiles.sort((a, b) => collator.compare(a.name, b.name))
					}))
					.sort((a, b) => collator.compare(a.label, b.label));
				const count = familyGroups.reduce((n, f) => n + f.profiles.length, 0);
				return { manufacturer, families: familyGroups, count };
			})
			.sort((a, b) => collator.compare(a.manufacturer, b.manufacturer));
	});
</script>

<SettingsSection title="Available profiles">
	{#snippet actions()}
		<Button variant="outline" size="sm" disabled={browsing} onclick={onBrowse}>
			{browsing ? "Browsing…" : "Browse repositories"}
		</Button>
	{/snippet}

	{#each errors as e (e.source)}
		<p class="text-xs text-destructive">Could not read {e.source}: {e.error}</p>
	{/each}

	{#if available === null}
		<p class="text-sm text-muted-foreground">
			Browse your repositories to see profiles you can download.
		</p>
	{:else if available.length === 0}
		<p class="text-sm text-muted-foreground">No profiles found in the enabled repositories.</p>
	{:else}
		<div class="flex flex-col gap-1">
			{#each groups as g (g.manufacturer)}
				<AvailableProfileGroup group={g} {busyId} {onInstall} />
			{/each}
		</div>
	{/if}
</SettingsSection>
