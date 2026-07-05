<script lang="ts">
	import { inverter } from '$lib/inverter/store.svelte';
	import ControlRow from '$lib/components/inverter/control-row.svelte';
	import TimeOfUse from '$lib/components/inverter/time-of-use.svelte';

	const settings = $derived(inverter.inGroup('settings').filter((m) => m.writable));
	// Deye/Sunsynk hybrids expose a time-of-use schedule; gate the editor on the
	// capability the manifest derives from the `timeofuse` metric group.
	const hasTimeOfUse = $derived(inverter.capabilities?.features.includes('time_of_use') ?? false);
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
	<header class="flex flex-col gap-1">
		<h1 class="text-lg font-semibold">Controls</h1>
		<p class="text-sm text-muted-foreground">
			Writable settings for {inverter.manifest?.name ?? 'this inverter'}. Changes are pushed to the
			inverter immediately.
		</p>
	</header>

	{#if settings.length === 0 && !hasTimeOfUse}
		<div
			class="flex h-40 items-center justify-center border border-border text-sm text-muted-foreground"
		>
			This inverter exposes no writable settings.
		</div>
	{:else}
		{#if settings.length > 0}
			<section class="flex flex-col border border-border p-4">
				<h2 class="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
					Inverter settings
				</h2>
				{#each settings as m (m.key)}
					<ControlRow metric={m} />
				{/each}
			</section>
		{/if}

		{#if hasTimeOfUse}
			<TimeOfUse />
		{/if}
	{/if}
</div>
