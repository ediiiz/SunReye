<script lang="ts">
	import CalendarBlank from 'phosphor-svelte/lib/CalendarBlank';
	import { getLocalTimeZone, type DateValue } from '@internationalized/date';
	import type { DateRange } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { RangeCalendar } from '$lib/components/ui/range-calendar';
	import { PRESETS, resolvePreset, customRange, type HistoryRange } from '$lib/inverter/ranges';

	// Owns range selection: preset list on the left, custom [from, to) calendar on
	// the right. The resolved window is bound back to the parent.
	let { range = $bindable() }: { range: HistoryRange } = $props();

	let open = $state(false);
	let custom = $state<DateRange>({ start: undefined, end: undefined });

	function choosePreset(id: string) {
		range = resolvePreset(id);
		open = false;
	}

	function applyCustom(start: DateValue, end: DateValue) {
		const tz = getLocalTimeZone();
		// Both are inclusive calendar days; customRange extends the upper bound to
		// the exclusive next-day boundary for the [from, to) query window.
		range = customRange(start.toDate(tz), end.toDate(tz));
		open = false;
	}

	// Fire once the user has picked both ends of the custom range.
	$effect(() => {
		if (custom.start && custom.end) applyCustom(custom.start, custom.end);
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class="gap-2">
				<CalendarBlank class="size-4" />
				{range.label}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="end">
		<div class="flex flex-col sm:flex-row">
			<div class="flex flex-row flex-wrap gap-1 border-b p-2 sm:w-40 sm:flex-col sm:border-b-0 sm:border-r">
				{#each PRESETS as p (p.id)}
					<Button
						variant={range.id === p.id ? 'secondary' : 'ghost'}
						size="sm"
						class="justify-start"
						onclick={() => choosePreset(p.id)}
					>
						{p.label}
					</Button>
				{/each}
			</div>
			<RangeCalendar bind:value={custom} numberOfMonths={1} />
		</div>
	</Popover.Content>
</Popover.Root>
