<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';
	import { Label } from '$lib/components/ui/label';
	import * as msg from '$lib/paraglide/messages';
	import { hhmmToLabel, labelToHhmm, type TouController, type TouSlot } from '$lib/inverter/tou.svelte';

	// Rendered keyed by slot index, so its local SOC draft resets on slot change.
	let {
		controller,
		slot,
		range,
		slotCount
	}: { controller: TouController; slot: TouSlot; range: string | null; slotCount: number } = $props();

	// Battery mode decides which target the inverter honors — show only that one.
	const mode = $derived(controller.targetMode);

	// SOC streams in as the thumb drags; commit the write only on release.
	let socDraft = $state<number | null>(null);
	const socValue = $derived(
		socDraft ?? (slot.metrics.soc ? controller.value(slot.metrics.soc.key) : undefined) ?? 0
	);

	function commitNumber(field: 'power' | 'voltage', raw: string) {
		const m = slot.metrics[field];
		const v = Number(raw);
		if (m && raw !== '' && !Number.isNaN(v)) controller.write(m.key, v, m.label);
	}
	function commitTime(raw: string) {
		const m = slot.metrics.time;
		const v = labelToHhmm(raw);
		if (m && v !== null) controller.write(m.key, v, m.label);
	}
</script>

<div class="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold">{msg.tou_slot_n({ index: slot.index })}</h3>
		<span class="text-xs tabular-nums text-muted-foreground">
			{range ?? msg.tou_period_of({ index: slot.index, count: slotCount })}
		</span>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		{#if slot.metrics.time}
			{@const m = slot.metrics.time}
			<div class="flex flex-col gap-1.5">
				<Label for="tou-start-{slot.index}">{msg.tou_start_time()}</Label>
				<Input
					id="tou-start-{slot.index}"
					type="time"
					value={hhmmToLabel(controller.value(m.key))}
					disabled={controller.busy(m.key)}
					onchange={(e) => commitTime(e.currentTarget.value)}
				/>
			</div>
		{/if}

		{#if slot.metrics.enabled}
			{@const m = slot.metrics.enabled}
			{@const on = controller.value(m.key) === 1}
			<div class="flex flex-col gap-1.5">
				<Label>{msg.tou_grid_charge()}</Label>
				<div class="flex h-8 items-center gap-2">
					<Switch
						checked={on}
						onCheckedChange={(c) => controller.write(m.key, c ? 1 : 0, m.label)}
						disabled={controller.busy(m.key)}
					/>
					<span class="text-xs text-muted-foreground">
						{on ? msg.tou_charges_hint() : msg.tou_discharges_hint()}
					</span>
				</div>
			</div>
		{/if}

		{#if slot.metrics.soc && mode !== 'voltage'}
			{@const m = slot.metrics.soc}
			<div class="flex flex-col gap-1.5 sm:col-span-2">
				<div class="flex items-center justify-between">
					<Label>{msg.tou_target_soc_label()}</Label>
					<span class="text-xs font-medium tabular-nums">{socValue}%</span>
				</div>
				<Slider
					type="single"
					value={socValue}
					min={0}
					max={100}
					step={1}
					disabled={controller.busy(m.key)}
					onValueChange={(v) => (socDraft = v)}
					onValueCommit={(v) => controller.write(m.key, v, m.label)}
				/>
			</div>
		{/if}

		{#if slot.metrics.power}
			{@const m = slot.metrics.power}
			<div class="flex flex-col gap-1.5">
				<Label for="tou-power-{slot.index}">{msg.tou_max_power()}</Label>
				<Input
					id="tou-power-{slot.index}"
					type="number"
					value={controller.value(m.key) ?? ''}
					disabled={controller.busy(m.key)}
					onchange={(e) => commitNumber('power', e.currentTarget.value)}
				/>
			</div>
		{/if}

		{#if slot.metrics.voltage && mode !== 'soc'}
			{@const m = slot.metrics.voltage}
			<div class="flex flex-col gap-1.5">
				<Label for="tou-voltage-{slot.index}">{msg.tou_target_voltage()}</Label>
				<Input
					id="tou-voltage-{slot.index}"
					type="number"
					step="0.01"
					value={controller.value(m.key) ?? ''}
					disabled={controller.busy(m.key)}
					onchange={(e) => commitNumber('voltage', e.currentTarget.value)}
				/>
			</div>
		{/if}
	</div>
</div>
