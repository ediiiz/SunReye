<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import type { ManifestMetric } from '$lib/inverter/types';
	import { hhmmToLabel, labelToHhmm, type TouController } from '$lib/inverter/tou.svelte';

	let { controller }: { controller: TouController } = $props();

	const slots = $derived(controller.slots);

	function commitNumber(m: ManifestMetric, raw: string) {
		const v = Number(raw);
		if (raw !== '' && !Number.isNaN(v)) controller.write(m.key, v, m.label);
	}
	function commitTime(m: ManifestMetric, raw: string) {
		const v = labelToHhmm(raw);
		if (v !== null) controller.write(m.key, v, m.label);
	}
</script>

<div class="overflow-x-auto">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head class="w-12">Slot</Table.Head>
				<Table.Head>Enabled</Table.Head>
				<Table.Head>Start</Table.Head>
				<Table.Head>Power (W)</Table.Head>
				<Table.Head>Voltage (V)</Table.Head>
				<Table.Head>SOC (%)</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each slots as slot (slot.index)}
				{@const enabled = slot.metrics.enabled}
				{@const time = slot.metrics.time}
				{@const power = slot.metrics.power}
				{@const voltage = slot.metrics.voltage}
				{@const soc = slot.metrics.soc}
				<Table.Row>
					<Table.Cell class="font-medium tabular-nums">{slot.index}</Table.Cell>
					<Table.Cell>
						{#if enabled}
							<Switch
								checked={controller.value(enabled.key) === 1}
								onCheckedChange={(c) => controller.write(enabled.key, c ? 1 : 0, enabled.label)}
								disabled={controller.busy(enabled.key)}
							/>
						{/if}
					</Table.Cell>
					<Table.Cell>
						{#if time}
							<Input
								type="time"
								class="w-28"
								value={hhmmToLabel(controller.value(time.key))}
								disabled={controller.busy(time.key)}
								onchange={(e) => commitTime(time, e.currentTarget.value)}
							/>
						{/if}
					</Table.Cell>
					<Table.Cell>
						{#if power}
							<Input
								type="number"
								class="w-24 tabular-nums"
								value={controller.value(power.key) ?? ''}
								disabled={controller.busy(power.key)}
								onchange={(e) => commitNumber(power, e.currentTarget.value)}
							/>
						{/if}
					</Table.Cell>
					<Table.Cell>
						{#if voltage}
							<Input
								type="number"
								step="0.01"
								class="w-24 tabular-nums"
								value={controller.value(voltage.key) ?? ''}
								disabled={controller.busy(voltage.key)}
								onchange={(e) => commitNumber(voltage, e.currentTarget.value)}
							/>
						{/if}
					</Table.Cell>
					<Table.Cell>
						{#if soc}
							<Input
								type="number"
								min="0"
								max="100"
								class="w-24 tabular-nums"
								value={controller.value(soc.key) ?? ''}
								disabled={controller.busy(soc.key)}
								onchange={(e) => commitNumber(soc, e.currentTarget.value)}
							/>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
