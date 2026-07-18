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

	let cfg = $state<MqttForm | null>(null);
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
		const { data } = await api.api.settings.mqtt.get();
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
		saving = false;
		if (error) {
			toast.error(m.mqtt_toast_error());
			return;
		}
		if (data) hasPassword = data.hasPassword;
		password = '';
		toast.success(m.mqtt_toast_saved());
	}
</script>

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

		<FormActions {result} {testing} {saving} ontest={test} onsave={save} />
	</SettingsSection>
{/if}
