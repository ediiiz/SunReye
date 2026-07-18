<script lang="ts">
	import PowerFlow from '$lib/components/inverter/power-flow-diagram.svelte';
	import WeatherTile from '$lib/components/inverter/weather-tile.svelte';
	import DailyEnergy from '$lib/components/inverter/daily-energy.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<!--
	Kiosk overview — the most important live values at a glance. The power-flow
	hero adapts its schematic to its box's aspect ratio (stacked on phones,
	fanned out on wide boxes). On lg+ (tablets, desktops, wall displays) the page
	pins to the full viewport height and never scrolls, in two columns: the
	portrait hero on the LEFT, weather + daily-energy tiles stacked on the RIGHT.
	The left column is held to ~53% of the width (proportional split, not a fixed
	right width) so its full-height box stays taller than it is wide at every
	desktop size — that <1.1 aspect ratio is what keeps the diagram in portrait.
	Phones scroll naturally: hero first, then weather, then the tiles. Detailed
	subsystem metrics live at /system.
-->
<div
	class="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:grid lg:h-svh lg:grid-cols-[1.15fr_1fr] lg:grid-rows-1 lg:overflow-hidden"
>
	<section class="relative h-[60svh] min-h-108 shrink-0 lg:h-full lg:min-h-0">
		<h2 class="sr-only">{m.overview_power_flow()}</h2>
		<PowerFlow />
	</section>

	<!-- Right column: weather at its natural height, energy cards fill the rest.
	     The weather tile renders nothing when disabled ({#if weather ...}); the
	     cards then simply take the whole column — no ghost gap, no centring logic
	     needed since each column owns its own width. -->
	<div class="flex flex-col gap-3 sm:gap-4 lg:min-h-0">
		<WeatherTile />
		<div class="w-full min-w-0 lg:min-h-0 lg:flex-1">
			<DailyEnergy />
		</div>
	</div>
</div>
