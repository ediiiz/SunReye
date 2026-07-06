<script lang="ts">
	import CalendarBlank from 'phosphor-svelte/lib/CalendarBlank';
	import { getLocalTimeZone, type DateValue } from '@internationalized/date';
	import type { DateRange } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { RangeCalendar } from '$lib/components/ui/range-calendar';

	// Presentational shell shared by the History and Costs range pickers: a trigger
	// button, a named-preset list, and a custom [from, to) calendar. It owns only
	// the popover/calendar UI state; the parent owns the range model and turns the
	// two callbacks into its own resolved range.
	let {
		presets,
		activeId,
		triggerLabel,
		onPreset,
		onCustomRange
	}: {
		presets: readonly { id: string; label: string }[];
		activeId: string;
		triggerLabel: string;
		onPreset: (id: string) => void;
		/** Both ends are inclusive calendar days in local time. */
		onCustomRange: (start: Date, end: Date) => void;
	} = $props();

	let open = $state(false);
	let custom = $state<DateRange>({ start: undefined, end: undefined });

	function choosePreset(id: string) {
		onPreset(id);
		open = false;
	}

	function applyCustom(start: DateValue, end: DateValue) {
		const tz = getLocalTimeZone();
		onCustomRange(start.toDate(tz), end.toDate(tz));
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
				{triggerLabel}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<!-- Clamp to the viewport space bits-ui reports so the preset row wraps on
	     mobile instead of sizing the popover to its single-line max-content. -->
	<Popover.Content
		class="w-auto max-w-(--bits-popover-content-available-width) overflow-x-auto p-0"
		align="end"
	>
		<div class="flex flex-col sm:flex-row">
			<div
				class="flex flex-row flex-wrap gap-1 border-b p-2 sm:w-40 sm:flex-col sm:border-b-0 sm:border-r"
			>
				{#each presets as p (p.id)}
					<Button
						variant={activeId === p.id ? 'secondary' : 'ghost'}
						size="sm"
						class="justify-start"
						onclick={() => choosePreset(p.id)}
					>
						{p.label}
					</Button>
				{/each}
			</div>
			<!-- Stacked (mobile) layout: stretch the calendar's fluid grid across the
		     popover; side-by-side it keeps its intrinsic width. -->
		<RangeCalendar bind:value={custom} numberOfMonths={1} class="w-full sm:w-auto" />
		</div>
	</Popover.Content>
</Popover.Root>
