<script lang="ts">
	import PresetRangePicker from '$lib/components/inverter/preset-range-picker.svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		COST_PRESETS,
		resolveCostPreset,
		customCostRange,
		type CostRange
	} from '$lib/cost/ranges';

	// Costs range picker: named presets (Today … This year) plus a custom calendar.
	// Emits a CostRange carrying both the tiles window and the contextual chart spec.
	let { range = $bindable() }: { range: CostRange } = $props();

	// Localized labels keyed by preset id (the English fallbacks live in
	// $lib/cost/ranges). A `custom` range keeps its date-formatted label as-is.
	const LABELS: Record<string, () => string> = {
		today: m.range_today,
		'7d': m.range_last_7d,
		month: m.range_this_month,
		lastMonth: m.range_last_month,
		year: m.range_this_year
	};
	const presets = $derived(COST_PRESETS.map((p) => ({ id: p.id, label: LABELS[p.id]?.() ?? p.label })));
	const triggerLabel = $derived(LABELS[range.id]?.() ?? range.label);
</script>

<PresetRangePicker
	{presets}
	activeId={range.id}
	{triggerLabel}
	onPreset={(id) => (range = resolveCostPreset(id))}
	onCustomRange={(start, end) => (range = customCostRange(start, end))}
/>
