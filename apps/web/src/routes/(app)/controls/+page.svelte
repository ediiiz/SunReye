<script lang="ts">
	import Lock from 'phosphor-svelte/lib/Lock';
	import LockOpen from 'phosphor-svelte/lib/LockOpen';
	import { inverter } from '$lib/inverter/store.svelte';
	import * as m from '$lib/paraglide/messages';
	import { Switch } from '$lib/components/ui/switch';
	import ControlRow from '$lib/components/inverter/control-row.svelte';
	import TimeOfUse from '$lib/components/inverter/time-of-use.svelte';

	const settings = $derived(inverter.inGroup('settings').filter((m) => m.writable));
	// Deye/Sunsynk hybrids expose a time-of-use schedule; gate the editor on the
	// capability the manifest derives from the `timeofuse` metric group.
	const hasTimeOfUse = $derived(inverter.capabilities?.features.includes('time_of_use') ?? false);

	// Frontend guard against accidental writes: the editable region starts locked
	// and `inert` (so every control below — settings, TOU timeline/table — ignores
	// input) until the user flips this switch. Purely client-side; the backend
	// still authorizes each command on its own.
	let unlocked = $state(false);
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
	<header class="flex flex-col gap-1">
		<h1 class="text-lg font-semibold">{m.nav_controls()}</h1>
		<p class="text-sm text-muted-foreground">
			{m.controls_subtitle({ name: inverter.manifest?.name ?? m.controls_this_inverter() })}
		</p>
	</header>

	{#if settings.length === 0 && !hasTimeOfUse}
		<div
			class="flex h-40 items-center justify-center border border-border text-sm text-muted-foreground"
		>
			{m.controls_no_writable()}
		</div>
	{:else}
		<div class="flex items-center justify-between gap-4 border border-border p-4">
			<div class="flex items-center gap-3">
				{#if unlocked}
					<LockOpen class="size-5 shrink-0 text-foreground" weight="duotone" />
				{:else}
					<Lock class="size-5 shrink-0 text-muted-foreground" weight="duotone" />
				{/if}
				<div class="flex flex-col">
					<span class="text-sm font-medium">
						{unlocked ? m.controls_unlocked() : m.controls_locked()}
					</span>
					<span class="text-xs text-muted-foreground">
						{m.controls_unlock_hint()}
					</span>
				</div>
			</div>
			<Switch bind:checked={unlocked} aria-label={m.controls_unlock_aria()} />
		</div>

		<div
			class="flex flex-col gap-6 transition-opacity"
			class:pointer-events-none={!unlocked}
			class:opacity-50={!unlocked}
			inert={!unlocked}
		>
			{#if settings.length > 0}
				<section class="flex flex-col border border-border p-4">
					<h2 class="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
						{m.controls_inverter_settings()}
					</h2>
					{#each settings as m (m.key)}
						<ControlRow metric={m} />
					{/each}
				</section>
			{/if}

			{#if hasTimeOfUse}
				<TimeOfUse />
			{/if}
		</div>
	{/if}
</div>
