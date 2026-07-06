<script lang="ts">
	import { api } from '$lib/api';
	import RangeSwitcher from '$lib/components/inverter/range-switcher.svelte';
	import TariffForm from '$lib/components/settings/tariff-form.svelte';
	import InverterForm from '$lib/components/settings/inverter-form.svelte';
	import MqttForm from '$lib/components/settings/mqtt-form.svelte';
	import ProfilesForm from '$lib/components/settings/profiles-form.svelte';
	import UsersForm from '$lib/components/settings/users-form.svelte';
	import ApiKeysForm from '$lib/components/settings/api-keys-form.svelte';
	import DangerZoneForm from '$lib/components/settings/danger-zone-form.svelte';
	import { useAppSession } from '$lib/session';

	const session = useAppSession();
	const isAdmin = $derived($session.data?.user.role === 'admin');

	// Profiles and Users are admin-only management surfaces; append them once we
	// know the viewer is an admin.
	const TABS = $derived([
		{ id: 'inverter', label: 'Inverter' },
		{ id: 'mqtt', label: 'MQTT & Home Assistant' },
		{ id: 'tariff', label: 'Tariff' },
		...(isAdmin
			? [
					{ id: 'profiles', label: 'Profiles' },
					{ id: 'users', label: 'Users' },
					{ id: 'apikeys', label: 'API Keys' },
					{ id: 'danger', label: 'Danger Zone' }
				]
			: [])
	] as const);
	let tab = $state<
		'inverter' | 'mqtt' | 'tariff' | 'profiles' | 'users' | 'apikeys' | 'danger'
	>('inverter');

	type Status = {
		inverter: {
			connected: boolean;
			simulate: boolean;
			lastError: string | null;
			lastSampleAt: string | null;
			profile: string;
		};
		mqtt: { enabled: boolean; connected: boolean; lastError: string | null };
	};

	let status = $state<Status | null>(null);

	// Poll live connection health so the tab badges stay current.
	$effect(() => {
		let stop = false;
		const tick = async () => {
			const { data } = await api.api.status.get();
			if (!stop && data) status = data as Status;
		};
		tick();
		const id = setInterval(tick, 3000);
		return () => {
			stop = true;
			clearInterval(id);
		};
	});
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
	<header class="flex flex-col gap-1">
		<h1 class="text-lg font-semibold">Settings</h1>
	</header>

	<div class="flex flex-col gap-6">
		<RangeSwitcher options={TABS} bind:value={tab} />

		{#if tab === 'inverter'}
			<div class="flex flex-col gap-6">
				<InverterForm status={status?.inverter ?? null} />
			</div>
		{:else if tab === 'mqtt'}
			<div class="flex flex-col gap-6">
				<MqttForm status={status?.mqtt ?? null} />
			</div>
		{:else if tab === 'tariff'}
			<div class="flex flex-col gap-6">
				<TariffForm />
			</div>
		{:else if tab === 'profiles' && isAdmin}
			<div class="flex flex-col gap-6">
				<ProfilesForm />
			</div>
		{:else if tab === 'users' && isAdmin}
			<div class="flex flex-col gap-6">
				<UsersForm />
			</div>
		{:else if tab === 'apikeys' && isAdmin}
			<div class="flex flex-col gap-6">
				<ApiKeysForm />
			</div>
		{:else if tab === 'danger' && isAdmin}
			<div class="flex flex-col gap-6">
				<DangerZoneForm />
			</div>
		{/if}
	</div>
</div>
