<script lang="ts">
	import PresetRangePicker from '$lib/components/inverter/preset-range-picker.svelte';
	import {
		COST_PRESETS,
		resolveCostPreset,
		customCostRange,
		type CostRange
	} from '$lib/cost/ranges';

	// Costs range picker: named presets (Today … This year) plus a custom calendar.
	// Emits a CostRange carrying both the tiles window and the contextual chart spec.
	let { range = $bindable() }: { range: CostRange } = $props();
</script>

<PresetRangePicker
	presets={COST_PRESETS}
	activeId={range.id}
	triggerLabel={range.label}
	onPreset={(id) => (range = resolveCostPreset(id))}
	onCustomRange={(start, end) => (range = customCostRange(start, end))}
/>
