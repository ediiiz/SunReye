<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import SettingsSection from './settings-section.svelte';
	import SolarForecastFields, { type ArrayFields } from './solar-forecast-fields.svelte';
	import { api } from '$lib/api';
	import { useAppSession } from '$lib/session';
	import * as m from '$lib/paraglide/messages';

	const session = useAppSession();
	const isAdmin = $derived($session.data?.user.role === 'admin');

	type PvArray = { kwp: number; tilt: number; azimuth: number };
	type WeatherConfig = {
		enabled: boolean;
		latitude: number | null;
		longitude: number | null;
		label: string;
		forecast: {
			enabled: boolean;
			provider: string;
			arrays: PvArray[];
			tempCoefficient: number;
			systemLoss: number;
		};
	};

	let draft = $state<WeatherConfig | null>(null);
	let saving = $state(false);
	// All numeric fields are bound as text so a half-typed "-" or "" doesn't
	// coerce to 0; parsed once on save.
	let latText = $state('');
	let lonText = $state('');
	let tempCoeffText = $state('');
	let lossText = $state('');
	let arrayTexts = $state<ArrayFields[]>([]);

	onMount(async () => {
		const { data } = await api.api.settings.weather.get();
		if (data) {
			draft = data as WeatherConfig;
			latText = draft.latitude?.toString() ?? '';
			lonText = draft.longitude?.toString() ?? '';
			tempCoeffText = draft.forecast.tempCoefficient.toString();
			lossText = draft.forecast.systemLoss.toString();
			arrayTexts = draft.forecast.arrays.map((a) => ({
				kwp: a.kwp.toString(),
				tilt: a.tilt.toString(),
				azimuth: a.azimuth.toString()
			}));
		}
	});

	function parseNum(text: string): number | null {
		const t = text.trim();
		if (t === '') return null;
		const n = Number(t);
		return Number.isFinite(n) ? n : null;
	}

	/** Parse the forecast inputs, or null (with a toast) when any is invalid. */
	function parseForecast(): { arrays: PvArray[]; tempCoefficient: number; systemLoss: number } | null {
		const arrays: PvArray[] = [];
		for (const t of arrayTexts) {
			const kwp = parseNum(t.kwp);
			const tilt = parseNum(t.tilt);
			const azimuth = parseNum(t.azimuth);
			if (kwp === null || tilt === null || azimuth === null) return null;
			arrays.push({ kwp, tilt, azimuth });
		}
		const tempCoefficient = parseNum(tempCoeffText);
		const systemLoss = parseNum(lossText);
		if (tempCoefficient === null || systemLoss === null) return null;
		return { arrays, tempCoefficient, systemLoss };
	}

	async function save() {
		if (!draft) return;
		const latitude = parseNum(latText);
		const longitude = parseNum(lonText);
		if (draft.enabled && (latitude === null || longitude === null)) {
			toast.error(m.weather_toast_invalid_coords());
			return;
		}
		const forecast = parseForecast();
		if (!forecast) {
			toast.error(m.weather_forecast_toast_invalid());
			return;
		}

		saving = true;
		const { data, error } = await api.api.settings.weather.put({
			enabled: draft.enabled,
			latitude,
			longitude,
			label: draft.label,
			forecast: {
				enabled: draft.forecast.enabled,
				provider: draft.forecast.provider,
				...forecast
			}
		});
		saving = false;
		if (error) toast.error(m.weather_toast_error());
		else {
			draft = data as WeatherConfig;
			toast.success(m.weather_toast_saved());
		}
	}
</script>

<SettingsSection title={m.weather_title()}>
	{#if !draft}
		<p class="text-sm text-muted-foreground">{m.app_loading()}</p>
	{:else}
		<p class="text-sm text-muted-foreground">
			{m.weather_desc()}
		</p>

		<div class="flex items-center justify-between gap-4">
			<Label for="weather-enabled">{m.weather_show_tile()}</Label>
			<Switch
				id="weather-enabled"
				checked={draft.enabled}
				disabled={!isAdmin || saving}
				onCheckedChange={(v) => draft && (draft.enabled = v)}
			/>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<Label for="weather-lat">{m.weather_latitude()}</Label>
				<Input
					id="weather-lat"
					bind:value={latText}
					disabled={!isAdmin || saving}
					inputmode="decimal"
					placeholder="50.39"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="weather-lon">{m.weather_longitude()}</Label>
				<Input
					id="weather-lon"
					bind:value={lonText}
					disabled={!isAdmin || saving}
					inputmode="decimal"
					placeholder="8.06"
				/>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<Label for="weather-label">{m.weather_location_name()}</Label>
			<Input
				id="weather-label"
				bind:value={draft.label}
				disabled={!isAdmin || saving}
				placeholder="Limburg-Weilburg"
				maxlength={120}
			/>
		</div>

		<Separator />

		<div class="flex flex-col gap-1">
			<div class="flex items-center justify-between gap-4">
				<Label for="forecast-enabled">{m.weather_forecast_enable()}</Label>
				<Switch
					id="forecast-enabled"
					checked={draft.forecast.enabled}
					disabled={!isAdmin || saving}
					onCheckedChange={(v) => draft && (draft.forecast.enabled = v)}
				/>
			</div>
			<p class="text-sm text-muted-foreground">{m.weather_forecast_desc()}</p>
		</div>

		{#if draft.forecast.enabled}
			<SolarForecastFields
				bind:arrays={arrayTexts}
				bind:tempCoeff={tempCoeffText}
				bind:loss={lossText}
				disabled={!isAdmin || saving}
			/>
		{/if}

		<div class="flex items-center gap-3">
			<Button onclick={save} disabled={!isAdmin || saving}>{saving ? m.action_saving() : m.action_save()}</Button>
			{#if !isAdmin}
				<span class="text-xs text-muted-foreground">{m.settings_admin_only()}</span>
			{/if}
		</div>
	{/if}
</SettingsSection>
