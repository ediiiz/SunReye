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

	const today = $derived(startOfDay(new Date()));
	// The day currently in view, or null when a non-day range (Live / preset) is
	// active — derived from the range so the arrows always track what's shown.
	const currentDay = $derived(range.id === 'day' ? startOfDay(range.from) : null);
	// In a day view the forward arrow always does something: it walks toward now
	// and, from today, returns to the realtime Live view. Disabled only when Live
	// (or another non-day range) is already showing.
	const canStepForward = $derived(currentDay !== null);

	function step(days: number) {
		// From a non-day range the first step drops into today (the most recent full
		// day), rather than skipping straight to yesterday.
		if (currentDay === null) {
			range = dayRange(today);
			return;
		}
		const next = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate() + days);
		// Stepping forward past today returns to the realtime Live view.
		if (next.getTime() > today.getTime()) {
			range = resolvePreset('live');
			return;
		}
		range = dayRange(next);
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
	{canStepForward}
/>
