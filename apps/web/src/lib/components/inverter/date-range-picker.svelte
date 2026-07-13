<script lang="ts">
	import PresetRangePicker from '$lib/components/inverter/preset-range-picker.svelte';
	import {
		PRESETS,
		resolvePreset,
		customRange,
		dayRange,
		type HistoryRange
	} from '$lib/inverter/ranges';
	import { display } from '$lib/display.svelte';

	// History range picker: live/rollup presets plus a custom calendar, with
	// prev/next day arrows folded into the same segmented control. Stepping drives
	// a single-day [00:00, 00:00) window; the resolved range is bound to the parent.
	let { range = $bindable() }: { range: HistoryRange } = $props();

	const DAY_MS = 86_400_000;
	const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

	// The day the stepper points at. Seeded to today; a preset chosen from the
	// popover doesn't move it, so arrows resume from the last stepped day.
	let anchor = $state(startOfDay(new Date()));
	const today = $derived(startOfDay(new Date()));
	const atToday = $derived(anchor.getTime() >= today.getTime());

	function step(days: number) {
		const next = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + days);
		if (next.getTime() > today.getTime()) return; // never step into the future
		anchor = next;
		range = dayRange(anchor);
	}

	// While a single day is active, show a friendly relative label; otherwise the
	// preset/custom label. Relative label honours the configured time zone.
	const triggerLabel = $derived.by(() => {
		if (range.id !== 'day') return range.label;
		const daysAgo = Math.round((today.getTime() - startOfDay(range.from).getTime()) / DAY_MS);
		return daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : display.day(range.from);
	});
</script>

<PresetRangePicker
	presets={PRESETS}
	activeId={range.id}
	{triggerLabel}
	onPreset={(id) => (range = resolvePreset(id))}
	onCustomRange={(start, end) => (range = customRange(start, end))}
	onStep={step}
	canStepForward={!atToday}
/>
