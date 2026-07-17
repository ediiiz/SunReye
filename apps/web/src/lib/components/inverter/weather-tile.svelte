<script lang="ts">
	import type { Component } from 'svelte';
	import Sun from 'phosphor-svelte/lib/Sun';
	import CloudSun from 'phosphor-svelte/lib/CloudSun';
	import Cloud from 'phosphor-svelte/lib/Cloud';
	import CloudFog from 'phosphor-svelte/lib/CloudFog';
	import CloudRain from 'phosphor-svelte/lib/CloudRain';
	import CloudSnow from 'phosphor-svelte/lib/CloudSnow';
	import CloudLightning from 'phosphor-svelte/lib/CloudLightning';
	import MapPin from 'phosphor-svelte/lib/MapPin';
	import { api } from '$lib/api';

	type Weather = {
		temperature: number;
		unit: string;
		condition: string;
		icon: string;
		solarRadiationSum: number | null;
		label: string;
	};

	const ICONS: Record<string, Component> = {
		clear: Sun,
		'partly-cloudy': CloudSun,
		cloudy: Cloud,
		fog: CloudFog,
		drizzle: CloudRain,
		rain: CloudRain,
		snow: CloudSnow,
		thunder: CloudLightning
	};

	let weather = $state<Weather | null>(null);

	// Poll well within the server's 15-min cache; the server does the real
	// throttling so this just keeps a long-lived wall display fresh.
	$effect(() => {
		let stop = false;
		const load = async () => {
			const { data } = await api.api.weather.get();
			if (!stop) weather = (data as Weather | null) ?? null;
		};
		load();
		const id = setInterval(load, 10 * 60 * 1000);
		return () => {
			stop = true;
			clearInterval(id);
		};
	});

	const Icon = $derived(weather ? (ICONS[weather.icon] ?? Cloud) : null);
</script>

{#if weather && Icon}
	<div class="flex items-center gap-4 rounded-lg border border-border bg-background px-4 py-3">
		<Icon class="size-10 shrink-0 text-primary" weight="duotone" />
		<div class="flex min-w-0 flex-col">
			<span class="text-2xl font-semibold tabular-nums leading-none">
				{Math.round(weather.temperature)}{weather.unit}
			</span>
			<span class="truncate text-sm text-muted-foreground">{weather.condition}</span>
			{#if weather.label}
				<span class="flex items-center gap-1 truncate text-xs text-muted-foreground">
					<MapPin class="size-3 shrink-0" />
					{weather.label}
				</span>
			{/if}
		</div>
		{#if weather.solarRadiationSum !== null}
			<div class="ml-auto flex flex-col items-end">
				<span class="text-sm font-medium tabular-nums">
					{weather.solarRadiationSum.toLocaleString(undefined, { maximumFractionDigits: 1 })}
				</span>
				<span class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">MJ/m² sun</span>
			</div>
		{/if}
	</div>
{/if}
