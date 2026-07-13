<script lang="ts">
	import type { Snippet } from "svelte";
	import CaretDown from "phosphor-svelte/lib/CaretDown";
	import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
	import * as Collapsible from "$lib/components/ui/collapsible";
	import { Input } from "$lib/components/ui/input";
	import type { RegisteredProfile } from "./profile-types";

	let {
		profiles,
		row,
		exclude,
		pinned,
		searchPlaceholder = "Search profiles…",
		emptyLabel = "No profiles available."
	}: {
		profiles: RegisteredProfile[];
		/** Renders one profile; its root element is a direct child of a `divide-y` group. */
		row: Snippet<[RegisteredProfile]>;
		/** Profiles to keep out of the groups (e.g. the pinned active one). */
		exclude?: (p: RegisteredProfile) => boolean;
		/** Rendered above the search box, unaffected by filtering. */
		pinned?: Snippet;
		searchPlaceholder?: string;
		/** Shown when there are no groupable profiles at all (no query). */
		emptyLabel?: string;
	} = $props();

	let search = $state("");
	/** Manufacturer groups the user has manually collapsed (only honoured when not searching). */
	let collapsed = $state<Record<string, boolean>>({});

	const query = $derived(search.trim().toLowerCase());
	const candidates = $derived(profiles.filter((p) => !exclude?.(p)));

	const groups = $derived.by(() => {
		const byManufacturer: Record<string, RegisteredProfile[]> = {};
		for (const p of candidates) {
			if (query && !`${p.name} ${p.manufacturer}`.toLowerCase().includes(query)) continue;
			const key = p.manufacturer || "Other";
			(byManufacturer[key] ??= []).push(p);
		}
		return Object.entries(byManufacturer).sort(([a], [b]) => a.localeCompare(b));
	});
</script>

{#if pinned}
	{@render pinned()}
{/if}

{#if candidates.length === 0}
	<p class="py-2 text-sm text-muted-foreground">{emptyLabel}</p>
{:else}
	<div class="relative">
		<MagnifyingGlass
			class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
		/>
		<Input placeholder={searchPlaceholder} bind:value={search} class="pl-9" />
	</div>

	{#if groups.length === 0}
		<p class="py-2 text-sm text-muted-foreground">No profiles match “{search}”.</p>
	{:else}
		<div class="flex flex-col gap-1">
			{#each groups as [manufacturer, list] (manufacturer)}
				<Collapsible.Root
					open={query !== "" || !collapsed[manufacturer]}
					onOpenChange={(v) => {
						if (!query) collapsed[manufacturer] = !v;
					}}
				>
					<Collapsible.Trigger
						class="group flex w-full items-center gap-2 border-b border-border py-2 text-left text-sm font-medium"
					>
						<CaretDown
							class="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
						/>
						{manufacturer}
						<span class="text-xs text-muted-foreground">({list.length})</span>
					</Collapsible.Trigger>
					<Collapsible.Content>
						<div class="flex flex-col divide-y divide-border">
							{#each list as p (p.id)}
								{@render row(p)}
							{/each}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/each}
		</div>
	{/if}
{/if}
