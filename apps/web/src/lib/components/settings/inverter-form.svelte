<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import FormActions from './form-actions.svelte';
	import StatusBadge from './status-badge.svelte';

	type InverterConfig = {
		simulate: boolean;
		host: string;
		port: number;
		unitId: number;
		timeoutMs: number;
		pollIntervalMs: number;
	};
	type InverterStatus = {
		connected: boolean;
		simulate: boolean;
		lastError: string | null;
		lastSampleAt: string | null;
		profile: string;
	};

	let { status = null }: { status?: InverterStatus | null } = $props();

	let cfg = $state<InverterConfig | null>(null);
	let saving = $state(false);
	let testing = $state(false);
	let testResult = $state<{ ok: boolean; error?: string; metricCount?: number } | null>(null);

	const result = $derived(
		testResult
			? {
					ok: testResult.ok,
					message: testResult.ok
						? `Connection OK — ${testResult.metricCount} metrics read`
						: `Failed: ${testResult.error}`
				}
			: null
	);

	onMount(async () => {
		const { data } = await api.api.settings.inverter.get();
		if (data) cfg = data;
	});

	async function test() {
		if (!cfg) return;
		testing = true;
		testResult = null;
		const { data, error } = await api.api.settings.inverter.test.post(cfg);
		testing = false;
		testResult = data ?? { ok: false, error: error ? String(error.value) : 'Request failed' };
	}

	async function save() {
		if (!cfg) return;
		saving = true;
		const { error } = await api.api.settings.inverter.put(cfg);
		saving = false;
		if (error) toast.error('Failed to save inverter settings');
		else toast.success('Inverter settings saved — applied live');
	}
</script>

{#if !cfg}
	<div class="flex h-40 items-center justify-center border border-border text-sm text-muted-foreground">
		Loading…
	</div>
{:else}
	<section class="flex flex-col gap-4 border border-border p-4">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Connection</h2>
			{#if status}
				<StatusBadge
					ok={status.connected}
					label={status.simulate ? 'Simulated' : status.connected ? 'Connected' : 'Disconnected'}
				/>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-4">
			<div class="flex flex-col">
				<Label for="simulate">Simulate</Label>
				<span class="text-xs text-muted-foreground">Generate synthetic data instead of Modbus.</span>
			</div>
			<Switch id="simulate" bind:checked={cfg.simulate} />
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<Label for="host">Host</Label>
				<Input id="host" bind:value={cfg.host} disabled={cfg.simulate} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="port">Port</Label>
				<Input id="port" type="number" bind:value={cfg.port} disabled={cfg.simulate} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="unit">Unit ID</Label>
				<Input id="unit" type="number" bind:value={cfg.unitId} disabled={cfg.simulate} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="timeout">Timeout (ms)</Label>
				<Input id="timeout" type="number" bind:value={cfg.timeoutMs} disabled={cfg.simulate} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="poll">Poll interval (ms)</Label>
				<Input id="poll" type="number" bind:value={cfg.pollIntervalMs} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>Active profile</Label>
				<div class="flex h-9 items-center px-1 text-sm text-muted-foreground">
					{status?.profile ?? '—'} <span class="ml-2 text-xs">(change requires restart)</span>
				</div>
			</div>
		</div>

		<FormActions {result} {testing} {saving} ontest={test} onsave={save} />
	</section>
{/if}
