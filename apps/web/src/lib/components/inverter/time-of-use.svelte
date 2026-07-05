<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import ControlRow from './control-row.svelte';
	import TouTimeline from './tou-timeline.svelte';
	import TouTable from './tou-table.svelte';
	import { TouController } from '$lib/inverter/tou.svelte';

	// One controller owns the optimistic write state so both views stay in sync.
	const controller = new TouController();
	const selling = $derived(controller.selling);
</script>

<section class="flex flex-col gap-4 border border-border p-4">
	<Tabs.Root value="visual">
		<div class="flex flex-col gap-1.5">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					Time-of-use schedule
				</h2>
				<Tabs.List variant="line">
					<Tabs.Trigger value="visual">Visual</Tabs.Trigger>
					<Tabs.Trigger value="table">Table</Tabs.Trigger>
				</Tabs.List>
			</div>
			<p class="text-xs text-muted-foreground">
				Six periods repeat every day; each runs until the next one starts. Each drives the battery
				toward a target SOC — with grid charge on it charges up to the target, otherwise it
				discharges down to it.
			</p>
		</div>

		{#if selling}
			<ControlRow metric={selling} />
		{/if}

		<Tabs.Content value="visual" class="pt-2">
			<TouTimeline {controller} />
		</Tabs.Content>
		<Tabs.Content value="table" class="pt-2">
			<TouTable {controller} />
		</Tabs.Content>
	</Tabs.Root>
</section>
