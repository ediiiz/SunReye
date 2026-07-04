<script lang="ts">
	import { api } from '$lib/api';
	import * as Tabs from '$lib/components/ui/tabs';
	import TariffForm from '$lib/components/settings/tariff-form.svelte';
	import InverterForm from '$lib/components/settings/inverter-form.svelte';
	import MqttForm from '$lib/components/settings/mqtt-form.svelte';

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
		<p class="text-sm text-muted-foreground">
			Tariff, inverter connection, and MQTT — changes apply live (no restart).
		</p>
	</header>

	<Tabs.Root value="inverter">
		<Tabs.List>
			<Tabs.Trigger value="inverter">Inverter</Tabs.Trigger>
			<Tabs.Trigger value="mqtt">MQTT &amp; Home Assistant</Tabs.Trigger>
			<Tabs.Trigger value="tariff">Tariff</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="inverter" class="flex flex-col gap-6">
			<InverterForm status={status?.inverter ?? null} />
		</Tabs.Content>
		<Tabs.Content value="mqtt" class="flex flex-col gap-6">
			<MqttForm status={status?.mqtt ?? null} />
		</Tabs.Content>
		<Tabs.Content value="tariff" class="flex flex-col gap-6">
			<TariffForm />
		</Tabs.Content>
	</Tabs.Root>
</div>
