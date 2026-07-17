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
	<div class="flex h-full items-center gap-4 rounded-xl border border-border/60 bg-card p-3 sm:p-4">
		<span
			class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 2xl:size-16"
		>
			<Icon class="size-7 text-primary 2xl:size-9" weight="duotone" />
		</span>
		<div class="flex min-w-0 flex-col gap-0.5">
			<span class="text-3xl font-semibold tabular-nums leading-none 2xl:text-4xl">
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
			<div class="ml-auto flex shrink-0 flex-col items-end">
				<span class="text-sm font-medium tabular-nums 2xl:text-base">
					{weather.solarRadiationSum.toLocaleString(undefined, { maximumFractionDigits: 1 })}
				</span>
				<span class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">MJ/m² sun</span>
			</div>
		{/if}
	</div>
{/if}
