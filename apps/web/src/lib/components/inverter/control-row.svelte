<script lang="ts">
	import { Slider } from '$lib/components/ui/slider';
	import { Switch } from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { inverter } from '$lib/inverter/store.svelte';
	import type { ManifestMetric } from '$lib/inverter/types';

	let { metric }: { metric: ManifestMetric } = $props();

	const live = $derived(inverter.value(metric.key));
	const enumKeys = $derived(
		metric.enumLabels ? Object.keys(metric.enumLabels).map(Number).sort((a, b) => a - b) : []
	);

	// Boolean enums render as a switch, larger enums as a select, ranged numbers
	// as a slider, everything else as a numeric input.
	const control = $derived.by(() => {
		if (metric.enumLabels) {
			return enumKeys.length === 2 && enumKeys[0] === 0 && enumKeys[1] === 1 ? 'switch' : 'select';
		}
		return metric.range ? 'slider' : 'number';
	});

	// Local pending value wins over the streamed value once the user acts.
	let pending = $state<number | null>(null);
	const value = $derived(pending ?? live ?? metric.range?.min ?? 0);

	// Seed the number field with the live value so the browser's native up/down
	// stepper increments from the current reading instead of starting at 1.
	// Reseed only when the underlying value actually changes — not merely when
	// the field loses focus — so a typed-but-unsubmitted edit survives the blur
	// that fires when the user clicks Apply.
	let inputValue = $state('');
	let seeded = $state<number>();
	$effect(() => {
		if (value !== seeded) {
			seeded = value;
			inputValue = String(value);
		}
	});

	let busy = $state(false);
	async function write(v: number) {
		busy = true;
		pending = v;
		try {
			const { error } = await api.api.commands.setting.post({ key: metric.key, value: v });
			if (error) throw error;
			toast.success(`${metric.label} → ${metric.enumLabels?.[v] ?? v}`);
		} catch {
			toast.error(`Failed to update ${metric.label}`);
			pending = null;
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-2 border-b border-border/40 py-3 last:border-b-0">
	<div class="flex items-center justify-between gap-4">
		<span class="text-sm font-medium">{metric.label}</span>
		<span class="text-xs tabular-nums text-muted-foreground">
			{metric.enumLabels?.[value] ?? value}{metric.unit ? ` ${metric.unit}` : ''}
		</span>
	</div>

	{#if control === 'switch'}
		<Switch checked={value === 1} onCheckedChange={(c) => write(c ? 1 : 0)} disabled={busy} />
	{:else if control === 'select'}
		<Select.Root type="single" value={String(value)} onValueChange={(v) => write(Number(v))}>
			<Select.Trigger class="w-full">{metric.enumLabels?.[value] ?? 'Select…'}</Select.Trigger>
			<Select.Content>
				{#each enumKeys as k (k)}
					<Select.Item value={String(k)}>{metric.enumLabels?.[k]}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	{:else if control === 'slider' && metric.range}
		<Slider
			type="single"
			{value}
			min={metric.range.min}
			max={metric.range.max}
			step={1}
			onValueChange={(v) => (pending = v)}
			onValueCommit={(v) => write(v)}
			disabled={busy}
		/>
	{:else}
		<div class="flex items-center gap-2">
			<Input type="number" bind:value={inputValue} class="w-32" />
			<Button
				size="sm"
				variant="secondary"
				disabled={busy || inputValue === '' || Number(inputValue) === value}
				onclick={() => write(Number(inputValue))}
			>
				Apply
			</Button>
		</div>
	{/if}
</div>
