<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import HourlyBarChart from './hourly-bar-chart.svelte';
	import { COST_X_TICKS } from '$lib/cost/ranges';
	import * as m from '$lib/paraglide/messages';

	// One hour of the provider-agnostic solar forecast (apps/server/src/solar-forecast.ts).
	type ForecastHour = { time: string; watts: number };

	let {
		hourly,
		todayKwh,
		tomorrowKwh,
		triggerClass,
		trigger
	}: {
		hourly: ForecastHour[];
		todayKwh: number;
		tomorrowKwh: number;
		/** Weather-tile classes — the whole tile becomes the dialog trigger button. */
		triggerClass: string;
		/** Weather-tile content, rendered inside the trigger button. */
		trigger: Snippet;
	} = $props();

	const kwh = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

	// The forecast spans today + tomorrow; the chart shows expected PV power across
	// today only (x = hour, y = kW). Today is the date of the first hour the
	// server emits (it builds the series from 00:00 today onward).
	const today = $derived(hourly[0]?.time.slice(0, 10) ?? '');
	const data = $derived(
		hourly
			.filter((h) => h.time.startsWith(today))
			.map((h) => ({ label: `${h.time.slice(11, 13)}:00`, kw: h.watts / 1000 }))
	);

	// Peak hour, surfaced as a caption so the busiest part of the day is called out
	// without per-bar coloring.
	const peak = $derived(
		data.reduce<{ label: string; kw: number } | null>(
			(best, d) => (best === null || d.kw > best.kw ? d : best),
			null
		)
	);

	const series = [
		{
			key: 'kw',
			label: m.weather_forecast_power(),
			color: 'var(--color-energy-solar)',
			value: (d: { kw: number }) => d.kw
		}
	];
</script>

<Dialog.Root>
	<Dialog.Trigger class={triggerClass}>
		{@render trigger()}
	</Dialog.Trigger>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{m.weather_forecast_title()}</Dialog.Title>
		</Dialog.Header>
		<div class="flex min-w-0 flex-col gap-3">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<span>
					{m.weather_forecast_today()}
					<span class="font-semibold tabular-nums text-foreground">{kwh(todayKwh)} kWh</span>
				</span>
				<span>
					{m.weather_forecast_tomorrow()}
					<span class="font-semibold tabular-nums text-foreground">{kwh(tomorrowKwh)} kWh</span>
				</span>
				{#if peak && peak.kw > 0}
					<span>
						{m.weather_forecast_peak()}
						<span class="font-semibold tabular-nums text-foreground">
							{kwh(peak.kw)} kW · {peak.label}
						</span>
					</span>
				{/if}
			</div>
			<HourlyBarChart
				{data}
				{series}
				unit="kW"
				xTicks={COST_X_TICKS.hour}
				empty={m.overview_no_data_today()}
			/>
		</div>
	</Dialog.Content>
</Dialog.Root>
