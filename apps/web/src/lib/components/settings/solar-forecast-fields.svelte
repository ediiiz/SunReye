<script lang="ts" module>
	/** One PV array row as raw input text (parsed by the parent on save). */
	export type ArrayFields = { kwp: string; tilt: string; azimuth: string };
</script>

<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/Plus';
	import TrashIcon from 'phosphor-svelte/lib/Trash';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as m from '$lib/paraglide/messages';

	let {
		arrays = $bindable(),
		tempCoeff = $bindable(),
		loss = $bindable(),
		disabled
	}: {
		arrays: ArrayFields[];
		tempCoeff: string;
		loss: string;
		disabled: boolean;
	} = $props();

	function addArray() {
		arrays = [...arrays, { kwp: '', tilt: '30', azimuth: '0' }];
	}

	function removeArray(index: number) {
		arrays = arrays.filter((_, i) => i !== index);
	}
</script>

<div class="flex flex-col gap-2">
	<span class="text-sm font-medium">{m.weather_forecast_arrays()}</span>
	{#if arrays.length === 0}
		<p class="text-sm text-muted-foreground">{m.weather_forecast_arrays_empty()}</p>
	{/if}
	{#each arrays as arr, i (i)}
		<div class="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
			<div class="flex flex-col gap-1.5">
				{#if i === 0}<Label for={`array-kwp-${i}`}>{m.weather_forecast_kwp()}</Label>{/if}
				<Input
					id={`array-kwp-${i}`}
					bind:value={arr.kwp}
					{disabled}
					inputmode="decimal"
					placeholder="9.6"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				{#if i === 0}<Label for={`array-tilt-${i}`}>{m.weather_forecast_tilt()}</Label>{/if}
				<Input
					id={`array-tilt-${i}`}
					bind:value={arr.tilt}
					{disabled}
					inputmode="decimal"
					placeholder="30"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				{#if i === 0}<Label for={`array-azimuth-${i}`}>{m.weather_forecast_azimuth()}</Label>{/if}
				<Input
					id={`array-azimuth-${i}`}
					bind:value={arr.azimuth}
					{disabled}
					inputmode="decimal"
					placeholder="0"
				/>
			</div>
			<Button
				variant="ghost"
				size="icon"
				onclick={() => removeArray(i)}
				{disabled}
				aria-label={m.weather_forecast_remove()}
			>
				<TrashIcon class="size-4" />
			</Button>
		</div>
	{/each}
	<p class="text-xs text-muted-foreground">{m.weather_forecast_azimuth_hint()}</p>
	<div>
		<Button variant="outline" size="sm" onclick={addArray} disabled={disabled || arrays.length >= 8}>
			<PlusIcon class="size-4" />
			{m.weather_forecast_add_array()}
		</Button>
	</div>
</div>

<div class="grid gap-3 sm:grid-cols-2">
	<div class="flex flex-col gap-1.5">
		<Label for="forecast-temp-coeff">{m.weather_forecast_temp_coeff()}</Label>
		<Input
			id="forecast-temp-coeff"
			bind:value={tempCoeff}
			{disabled}
			inputmode="decimal"
			placeholder="-0.4"
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="forecast-loss">{m.weather_forecast_loss()}</Label>
		<Input id="forecast-loss" bind:value={loss} {disabled} inputmode="decimal" placeholder="14" />
	</div>
</div>
