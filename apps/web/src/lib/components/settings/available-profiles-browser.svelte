<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import AvailableProfileGroup from "./available-profile-group.svelte";
	import SettingsSection from "./settings-section.svelte";
	import type { AvailableProfile, FamilyGroup, ManufacturerGroup, Source } from "./profile-types";
	import * as m from "$lib/paraglide/messages";

	let {
		available,
		sources,
		errors,
		browsing,
		busyId,
		onBrowse,
		onInstall
	}: {
		available: AvailableProfile[] | null;
		sources: Source[];
		errors: { source: string; error: string }[];
		browsing: boolean;
		busyId: string | null;
		onBrowse: () => void;
		onInstall: (p: AvailableProfile) => void;
	} = $props();

	// Numeric-aware so "SUN-5K" sorts before "SUN-10K" (plain order puts "10" first).
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

	// A `defineFamily` emits a base profile plus per-SKU models; the built output
	// drops the family link, so recover it from the ids. Whatever the naming
	// convention — SKU as a suffix (`deye-sg05lp3` → `deye-sun14k-sg05lp3`) or a
	// suffix on the family (`deye-sg01hp3` → `deye-sg01hp3-5k`) — every model id is
	// a hyphen-token superset of its base id. Cluster on that instead of guessing
	// which segment is the family token, so both conventions group identically.
	const tokenSet = (id: string): Set<string> => new Set(id.split("-"));
	const isSubset = (a: Set<string>, b: Set<string>): boolean => {
		for (const t of a) if (!b.has(t)) return false;
		return true;
	};

	function clusterFamilies(profiles: AvailableProfile[]): FamilyGroup[] {
		// Fewest tokens first so a base is always seen before its models; the base
		// then seeds the family and every superset id attaches to it.
		const ordered = [...profiles].sort(
			(a, b) => a.id.split("-").length - b.id.split("-").length || collator.compare(a.name, b.name)
		);
		const families: { base: AvailableProfile; tokens: Set<string>; profiles: AvailableProfile[] }[] =
			[];
		for (const p of ordered) {
			const tokens = tokenSet(p.id);
			// Attach to the most specific base whose tokens this id contains; if none
			// match, this id is itself a new family base.
			let best: (typeof families)[number] | null = null;
			for (const f of families) {
				if (isSubset(f.tokens, tokens) && (best === null || f.tokens.size > best.tokens.size)) {
					best = f;
				}
			}
			if (best) best.profiles.push(p);
			else families.push({ base: p, tokens, profiles: [p] });
		}
		return families
			.map((f) => ({
				key: f.base.id,
				label: f.base.name,
				profiles: f.profiles.sort((a, b) => collator.compare(a.name, b.name))
			}))
			.sort((a, b) => collator.compare(a.label, b.label));
	}

	const groups = $derived.by((): ManufacturerGroup[] => {
		const byManufacturer: Record<string, AvailableProfile[]> = {};
		for (const p of available ?? []) {
			const manufacturer = p.manufacturer || "Other";
			(byManufacturer[manufacturer] ??= []).push(p);
		}
		return Object.entries(byManufacturer)
			.map(([manufacturer, profiles]) => {
				const families = clusterFamilies(profiles);
				const count = families.reduce((n, f) => n + f.profiles.length, 0);
				return { manufacturer, families, count };
			})
			.sort((a, b) => collator.compare(a.manufacturer, b.manufacturer));
	});
</script>

<SettingsSection title={m.profiles_available_title()}>
	{#snippet actions()}
		<Button variant="outline" size="sm" disabled={browsing} onclick={onBrowse}>
			{browsing ? m.profiles_browsing() : m.profiles_browse()}
		</Button>
	{/snippet}

	{#each errors as e (e.source)}
		<p class="text-xs text-destructive">{m.profiles_browse_error({ source: e.source, error: e.error })}</p>
	{/each}

	{#if available === null}
		<p class="text-sm text-muted-foreground">
			{m.profiles_browse_hint()}
		</p>
	{:else if available.length === 0}
		<p class="text-sm text-muted-foreground">{m.profiles_none_found()}</p>
	{:else}
		<div class="flex flex-col gap-1">
			{#each groups as g (g.manufacturer)}
				<AvailableProfileGroup group={g} {sources} {busyId} {onInstall} />
			{/each}
		</div>
	{/if}
</SettingsSection>
