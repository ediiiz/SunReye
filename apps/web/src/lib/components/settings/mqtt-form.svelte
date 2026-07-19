<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import FormActions from './form-actions.svelte';
	import SettingsSection from './settings-section.svelte';
	import StatusBadge from './status-badge.svelte';
	import * as m from '$lib/paraglide/messages';

	// Form shape: the password is write-only. `hasPassword` reflects whether one
	// is already stored; the password field stays empty and is only sent when the
	// user types a new value.
	type MqttForm = {
		enabled: boolean;
		brokerUrl: string;
		username: string;
		topicPrefix: string;
		haDiscoveryEnabled: boolean;
		haDiscoveryPrefix: string;
	};
	type MqttStatus = { enabled: boolean; connected: boolean; lastError: string | null };

	let { status = null }: { status?: MqttStatus | null } = $props();

	// EVCC integration rides the same broker, so its two knobs live on this page
	// and save with the same button.
	type EvccForm = { enabled: boolean; topicRoot: string; subtractFromHome: boolean };

	let cfg = $state<MqttForm | null>(null);
	let evccCfg = $state<EvccForm | null>(null);
	let hasPassword = $state(false);
	let password = $state('');
	let saving = $state(false);
	let testing = $state(false);
	let testResult = $state<{ ok: boolean; error?: string } | null>(null);

	const result = $derived(
		testResult
			? {
					ok: testResult.ok,
					message: testResult.ok
						? m.mqtt_test_ok()
						: m.conn_test_failed({ error: testResult.error ?? '' })
				}
			: null
	);

	onMount(async () => {
		const [{ data }, { data: evccData }] = await Promise.all([
			api.api.settings.mqtt.get(),
			api.api.settings.evcc.get()
		]);
		if (data) {
			hasPassword = data.hasPassword;
			cfg = {
				enabled: data.enabled,
				brokerUrl: data.brokerUrl,
				username: data.username ?? '',
				topicPrefix: data.topicPrefix,
				haDiscoveryEnabled: data.haDiscoveryEnabled,
				haDiscoveryPrefix: data.haDiscoveryPrefix
			};
		}
		if (evccData)
			evccCfg = {
				enabled: evccData.enabled,
				topicRoot: evccData.topicRoot,
				subtractFromHome: evccData.subtractFromHome
			};
	});

	// Only send username/password when non-empty (password absent = unchanged).
	function payload() {
		if (!cfg) return null;
		return {
			...cfg,
			username: cfg.username || undefined,
			...(password ? { password } : {})
		};
	}

	async function test() {
		const body = payload();
		if (!body) return;
		testing = true;
		testResult = null;
		const { data, error } = await api.api.settings.mqtt.test.post(body);
		testing = false;
		testResult = data ?? { ok: false, error: error ? String(error.value) : m.conn_request_failed() };
	}

	async function save() {
		const body = payload();
		if (!body) return;
		saving = true;
		const { data, error } = await api.api.settings.mqtt.put(body);
		if (error) {
			saving = false;
			toast.error(m.mqtt_toast_error());
			return;
		}
		if (data) hasPassword = data.hasPassword;
		password = '';
		// EVCC config saves with the same button (it shares the broker above).
		if (evccCfg) {
			const { error: evccError } = await api.api.settings.evcc.put(evccCfg);
			if (evccError) {
				saving = false;
				toast.error(m.evcc_toast_error());
				return;
			}
		}
		saving = false;
		toast.success(m.mqtt_toast_saved());
	}
</script>

<FormActions {result} {testing} {saving} disabled={!cfg} ontest={test} onsave={save} />

{#if !cfg}
	<div class="flex h-40 items-center justify-center border border-border text-sm text-muted-foreground">
		{m.app_loading()}
	</div>
{:else}
	<SettingsSection title={m.mqtt_broker_title()}>
		{#snippet actions()}
			{#if status}
				<StatusBadge
					ok={status.connected}
					label={!status.enabled
						? m.mqtt_status_disabled()
						: status.connected
							? m.status_connected()
							: m.status_connecting()}
				/>
			{/if}
		{/snippet}

		<div class="flex items-center justify-between gap-4">
			<div class="flex flex-col">
				<Label for="mqtt-enabled">{m.label_enabled()}</Label>
				<span class="text-xs text-muted-foreground">{m.mqtt_enabled_desc()}</span>
			</div>
			<Switch id="mqtt-enabled" bind:checked={cfg.enabled} />
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<Label for="broker">Broker URL</Label>
				<Input id="broker" bind:value={cfg.brokerUrl} placeholder="mqtt://host:1883" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="prefix">Topic prefix</Label>
				<Input id="prefix" bind:value={cfg.topicPrefix} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="mqtt-user">{m.mqtt_username()}</Label>
				<Input id="mqtt-user" bind:value={cfg.username} autocomplete="off" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="mqtt-pass">{m.auth_field_password()}</Label>
				<Input
					id="mqtt-pass"
					type="password"
					bind:value={password}
					autocomplete="new-password"
					placeholder={hasPassword ? m.mqtt_password_unchanged() : ''}
				/>
			</div>
		</div>

		<div class="flex items-center justify-between gap-4 border-t border-border pt-4">
			<div class="flex flex-col">
				<Label for="ha">{m.mqtt_ha_discovery()}</Label>
				<span class="text-xs text-muted-foreground">{m.mqtt_ha_desc()}</span>
			</div>
			<Switch id="ha" bind:checked={cfg.haDiscoveryEnabled} />
		</div>
		{#if cfg.haDiscoveryEnabled}
			<div class="flex flex-col gap-1.5">
				<Label for="ha-prefix">Discovery prefix</Label>
				<Input id="ha-prefix" bind:value={cfg.haDiscoveryPrefix} class="max-w-60" />
			</div>
		{/if}
	</SettingsSection>

	{#if evccCfg}
		<!-- EVCC ingest reuses the broker configured above but runs its own
		     subscription, independent of the inverter→MQTT publishing toggle. -->
		<SettingsSection title={m.evcc_settings_title()}>
			<div class="flex items-center justify-between gap-4">
				<div class="flex flex-col">
					<Label for="evcc-enabled">{m.label_enabled()}</Label>
					<span class="text-xs text-muted-foreground">{m.evcc_enabled_desc()}</span>
				</div>
				<Switch id="evcc-enabled" bind:checked={evccCfg.enabled} />
			</div>
			{#if evccCfg.enabled}
				<div class="flex flex-col gap-1.5">
					<Label for="evcc-topic">{m.evcc_topic_root()}</Label>
					<Input id="evcc-topic" bind:value={evccCfg.topicRoot} class="max-w-60" placeholder="evcc" />
					<span class="text-xs text-muted-foreground">{m.evcc_topic_hint()}</span>
				</div>
				<div class="flex items-center justify-between gap-4 border-t border-border pt-4">
					<div class="flex flex-col">
						<Label for="evcc-subtract">{m.evcc_subtract_label()}</Label>
						<span class="text-xs text-muted-foreground">{m.evcc_subtract_hint()}</span>
					</div>
					<Switch id="evcc-subtract" bind:checked={evccCfg.subtractFromHome} />
				</div>
			{/if}
		</SettingsSection>
	{/if}
{/if}
