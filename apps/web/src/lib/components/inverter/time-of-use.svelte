<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import ControlRow from './control-row.svelte';
	import TouTimeline from './tou-timeline.svelte';
	import TouTable from './tou-table.svelte';
	import * as m from '$lib/paraglide/messages';
	import { TouController } from '$lib/inverter/tou.svelte';

	// One controller owns the optimistic write state so both views stay in sync.
	const controller = new TouController();
	const selling = $derived(controller.selling);
	// Lead-acid batteries are driven by target voltage, lithium by target SOC.
	const isVoltage = $derived(controller.targetMode === 'voltage');
</script>

<section class="flex flex-col gap-4 border border-border p-4">
	<Tabs.Root value="visual">
		<div class="flex flex-col gap-1.5">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					{m.tou_schedule_title()}
				</h2>
				<Tabs.List variant="line">
					<Tabs.Trigger value="visual">{m.tou_tab_visual()}</Tabs.Trigger>
					<Tabs.Trigger value="table">{m.tou_tab_table()}</Tabs.Trigger>
				</Tabs.List>
			</div>
			<p class="text-xs text-muted-foreground">
				{isVoltage ? m.tou_schedule_desc_voltage() : m.tou_schedule_desc_soc()}
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
