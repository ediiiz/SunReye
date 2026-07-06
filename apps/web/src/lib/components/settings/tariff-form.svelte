<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import SettingsSection from './settings-section.svelte';
	import PlusIcon from 'phosphor-svelte/lib/Plus';
	import TrashIcon from 'phosphor-svelte/lib/Trash';

	type Band = {
		name: string;
		pricePerKwh: number;
		startHour: number;
		endHour: number;
		days: number[];
	};
	type Tariff = {
		currency: string;
		standingChargeMonthly: number;
		import: { defaultPricePerKwh: number; bands: Band[] };
		export: { feedInPerKwh: number };
	};

	const WEEKDAYS = [
		{ n: 1, label: 'Mon' },
		{ n: 2, label: 'Tue' },
		{ n: 3, label: 'Wed' },
		{ n: 4, label: 'Thu' },
		{ n: 5, label: 'Fri' },
		{ n: 6, label: 'Sat' },
		{ n: 7, label: 'Sun' }
	];

	let tariff = $state<Tariff | null>(null);
	let loading = $state(true);
	let saving = $state(false);

	onMount(async () => {
		const { data } = await api.api.settings.tariff.get();
		// Bands may omit `days` (= every day); normalize to a full array for editing.
		tariff = {
			currency: data?.currency ?? 'EUR',
			standingChargeMonthly: data?.standingChargeMonthly ?? 0,
			import: {
				defaultPricePerKwh: data?.import.defaultPricePerKwh ?? 0,
				bands: (data?.import.bands ?? []).map((b) => ({
					name: b.name,
					pricePerKwh: b.pricePerKwh,
					startHour: b.startHour,
					endHour: b.endHour,
					days: b.days ?? [1, 2, 3, 4, 5, 6, 7]
				}))
			},
			export: { feedInPerKwh: data?.export.feedInPerKwh ?? 0 }
		};
		loading = false;
	});

	function addBand() {
		tariff?.import.bands.push({
			name: 'Peak',
			pricePerKwh: 0,
			startHour: 8,
			endHour: 20,
			days: [1, 2, 3, 4, 5]
		});
	}

	function removeBand(i: number) {
		tariff?.import.bands.splice(i, 1);
	}

	function toggleDay(band: Band, n: number) {
		band.days = band.days.includes(n) ? band.days.filter((d) => d !== n) : [...band.days, n].sort();
	}

	async function save() {
		if (!tariff) return;
		saving = true;
		// A band covering all 7 days sends no `days` (semantically "every day").
		const payload = {
			...tariff,
			import: {
				...tariff.import,
				bands: tariff.import.bands.map((b) => ({
					name: b.name,
					pricePerKwh: b.pricePerKwh,
					startHour: b.startHour,
					endHour: b.endHour,
					...(b.days.length > 0 && b.days.length < 7 ? { days: b.days } : {})
				}))
			}
		};
		const { error } = await api.api.settings.tariff.put(payload);
		saving = false;
		if (error) toast.error('Failed to save tariff');
		else toast.success('Tariff saved');
	}
</script>

{#if loading || !tariff}
	<div class="flex h-40 items-center justify-center border border-border text-sm text-muted-foreground">
		Loading tariff…
	</div>
{:else}
	<SettingsSection title="General">
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="flex flex-col gap-1.5">
				<Label for="currency">Currency (ISO)</Label>
				<Input id="currency" maxlength={3} bind:value={tariff.currency} class="uppercase" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="standing">Standing charge / month</Label>
				<Input id="standing" type="number" step="0.01" bind:value={tariff.standingChargeMonthly} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="feedin">Feed-in / kWh</Label>
				<Input id="feedin" type="number" step="0.001" bind:value={tariff.export.feedInPerKwh} />
			</div>
		</div>
	</SettingsSection>

	<SettingsSection title="Import price">
		{#snippet actions()}
			<Button variant="ghost" size="sm" onclick={addBand}>
				<PlusIcon class="size-4" /> Add band
			</Button>
		{/snippet}

		<div class="flex flex-col gap-1.5">
			<Label for="default-price">Default price / kWh</Label>
			<Input
				id="default-price"
				type="number"
				step="0.001"
				bind:value={tariff.import.defaultPricePerKwh}
				class="max-w-40"
			/>
			<span class="text-xs text-muted-foreground">
				Applied to any hour not covered by a time-of-use band below.
			</span>
		</div>

		{#if tariff.import.bands.length === 0}
			<p class="text-sm text-muted-foreground">
				Flat rate — every hour uses the default price. Add a band for time-of-use pricing.
			</p>
		{/if}

		{#each tariff.import.bands as band, i (i)}
			<div class="flex flex-col gap-3 border border-border p-3">
				<div class="flex items-end gap-3">
					<div class="flex flex-1 flex-col gap-1.5">
						<Label>Name</Label>
						<Input bind:value={band.name} />
					</div>
					<div class="flex w-28 flex-col gap-1.5">
						<Label>Price / kWh</Label>
						<Input type="number" step="0.001" bind:value={band.pricePerKwh} />
					</div>
					<div class="flex w-20 flex-col gap-1.5">
						<Label>From (h)</Label>
						<Input type="number" min="0" max="23" bind:value={band.startHour} />
					</div>
					<div class="flex w-20 flex-col gap-1.5">
						<Label>To (h)</Label>
						<Input type="number" min="1" max="24" bind:value={band.endHour} />
					</div>
					<Button variant="ghost" size="icon" onclick={() => removeBand(i)} aria-label="Remove band">
						<TrashIcon class="size-4" />
					</Button>
				</div>
				<div class="flex flex-wrap gap-1">
					{#each WEEKDAYS as d (d.n)}
						<Button
							variant={band.days.includes(d.n) ? 'default' : 'outline'}
							size="sm"
							onclick={() => toggleDay(band, d.n)}
						>
							{d.label}
						</Button>
					{/each}
				</div>
			</div>
		{/each}
	</SettingsSection>

	<div class="flex justify-end">
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save tariff'}</Button>
	</div>
{/if}
