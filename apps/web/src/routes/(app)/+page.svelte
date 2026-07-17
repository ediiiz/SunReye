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
	<section class="relative h-[56svh] min-h-96 shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
		<h2 class="sr-only">{m.overview_power_flow()}</h2>
		<PowerFlow />
	</section>

	<div class="flex shrink-0 flex-col gap-3 sm:gap-4 lg:flex-row">
		<div class="lg:w-80 lg:shrink-0 2xl:w-96">
			<WeatherTile />
		</div>
		<div class="min-w-0 lg:flex-1">
			<DailyEnergy />
		</div>
	</div>
</div>
