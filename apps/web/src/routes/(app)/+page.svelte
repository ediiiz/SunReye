<script lang="ts">
	import PowerFlow from '$lib/components/inverter/power-flow-diagram.svelte';
	import WeatherTile from '$lib/components/inverter/weather-tile.svelte';
	import DailyEnergy from '$lib/components/inverter/daily-energy.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<!--
	Kiosk overview — the most important live values at a glance. The power-flow
	hero fills the free space and adapts its schematic to the box's aspect ratio
	(stacked on phones, fanned out on wide screens). On lg+ (tablets, desktops,
	wall displays) the page pins to the viewport minus the 3.5rem header and
	never scrolls: hero on top, one strip of weather + daily-energy tiles below.
	Phones scroll naturally: hero first, then the tiles. Detailed subsystem
	metrics live at /system.
-->
<div
	class="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden"
>
	<section class="relative h-[60svh] min-h-108 shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
		<h2 class="sr-only">{m.overview_power_flow()}</h2>
		<PowerFlow />
	</section>

	<!-- The weather tile renders nothing when disabled — no wrapper may claim its
	     slot, or the strip shows a ghost gap. Without the tile the energy cards
	     are capped and centred; with it they stretch to fill the row (`:has()`
	     via group-has, no JS). -->
	<div class="group flex shrink-0 flex-col gap-3 sm:gap-4 lg:flex-row lg:justify-center">
		<WeatherTile />
		<div
			class="w-full min-w-0 lg:max-w-4xl lg:group-has-data-weather-tile:max-w-none lg:group-has-data-weather-tile:flex-1 2xl:max-w-5xl"
		>
			<DailyEnergy />
		</div>
	</div>
</div>
