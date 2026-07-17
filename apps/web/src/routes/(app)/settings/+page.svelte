<script lang="ts">
	import { api } from '$lib/api';
	import * as Tabs from '$lib/components/ui/tabs';
	import TariffForm from '$lib/components/settings/tariff-form.svelte';
	import InverterForm from '$lib/components/settings/inverter-form.svelte';
	import MqttForm from '$lib/components/settings/mqtt-form.svelte';
	import DisplayForm from '$lib/components/settings/display-form.svelte';
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
		{ id: 'display', label: 'Date & Time' },
		...(isAdmin
			? [
					{ id: 'profiles', label: 'Profiles' },
					{ id: 'users', label: 'Users' },
					{ id: 'apikeys', label: 'API Keys' },
					{ id: 'danger', label: 'Danger Zone' }
				]
			: [])
	] as const);
	let tab = $state('inverter');

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

	<Tabs.Root bind:value={tab} class="gap-6">
		<!-- Mobile: single-line horizontal scroll. Desktop (sm+): wrap within the
		     column instead of scrolling, since there is room to lay the tabs out. -->
		<div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-x-visible sm:px-0">
			<Tabs.List variant="line" class="w-max sm:w-full sm:flex-wrap">
				{#each TABS as t (t.id)}
					<Tabs.Trigger value={t.id}>{t.label}</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</div>

		<Tabs.Content value="inverter" class="flex flex-col gap-6">
			<InverterForm status={status?.inverter ?? null} />
		</Tabs.Content>
		<Tabs.Content value="mqtt" class="flex flex-col gap-6">
			<MqttForm status={status?.mqtt ?? null} />
		</Tabs.Content>
		<Tabs.Content value="tariff" class="flex flex-col gap-6">
			<TariffForm />
		</Tabs.Content>
		<Tabs.Content value="display" class="flex flex-col gap-6">
			<DisplayForm />
		</Tabs.Content>
		{#if isAdmin}
			<Tabs.Content value="profiles" class="flex flex-col gap-6">
				<ProfilesForm />
			</Tabs.Content>
			<Tabs.Content value="users" class="flex flex-col gap-6">
				<UsersForm />
			</Tabs.Content>
			<Tabs.Content value="apikeys" class="flex flex-col gap-6">
				<ApiKeysForm />
			</Tabs.Content>
			<Tabs.Content value="danger" class="flex flex-col gap-6">
				<DangerZoneForm />
			</Tabs.Content>
		{/if}
	</Tabs.Root>
</div>
