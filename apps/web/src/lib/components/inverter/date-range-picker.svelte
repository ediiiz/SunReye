<script lang="ts">
	import PresetRangePicker from '$lib/components/inverter/preset-range-picker.svelte';
	import { PRESETS, resolvePreset, customRange, type HistoryRange } from '$lib/inverter/ranges';

	// History range picker: live/rollup presets plus a custom calendar. The resolved
	// window is bound back to the parent. `customRange` extends the upper bound to
	// the exclusive next-day boundary for the [from, to) query window.
	let { range = $bindable() }: { range: HistoryRange } = $props();
</script>

<PresetRangePicker
	presets={PRESETS}
	activeId={range.id}
	triggerLabel={range.label}
	onPreset={(id) => (range = resolvePreset(id))}
	onCustomRange={(start, end) => (range = customRange(start, end))}
/>
