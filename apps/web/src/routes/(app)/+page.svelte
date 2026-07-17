<script lang="ts">
	import PowerFlow from '$lib/components/inverter/power-flow-diagram.svelte';
	import WeatherTile from '$lib/components/inverter/weather-tile.svelte';
	import DailyEnergy from '$lib/components/inverter/daily-energy.svelte';
	import * as m from '$lib/paraglide/messages';
</script>

<!--
	Single-screen kiosk overview — the most important live values, always fully
	visible (built for wall displays). The page itself never scrolls: it's pinned
	to the viewport minus the 3.5rem header. The power-flow hero takes the free
	space and scrolls only inside its own card on very short screens; weather +
	daily-energy tiles stay pinned. Detailed subsystem metrics live at /system.
-->
<div
	class="flex h-[calc(100svh-3.5rem)] flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:flex-row"
>
	<section
		class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto rounded-lg border border-border p-2 lg:flex-2"
	>
		<h2 class="px-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">
			{m.overview_power_flow()}
		</h2>
		<div class="flex min-h-0 flex-1 items-center">
			<PowerFlow />
		</div>
	</section>

	<aside class="flex shrink-0 flex-col gap-3 sm:gap-4 lg:min-w-0 lg:flex-1">
		<WeatherTile />
		<DailyEnergy />
	</aside>
</div>
