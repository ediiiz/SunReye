<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import * as Select from "$lib/components/ui/select";
	import * as Table from "$lib/components/ui/table";
	import FormActions from "./form-actions.svelte";
	import SettingsSection from "./settings-section.svelte";
	import StatusBadge from "./status-badge.svelte";

	type Transport = "tcp" | "rtu-over-tcp";
	type InverterConfig = {
		host: string;
		port: number;
		transport: Transport;
		unitId: number;
		timeoutMs: number;
		pollIntervalMs: number;
	};

	const TRANSPORTS: { value: Transport; label: string }[] = [
		{ value: "tcp", label: "Modbus TCP" },
		{ value: "rtu-over-tcp", label: "Modbus RTU over TCP" }
	];
	const transportLabel = (t: Transport) =>
		TRANSPORTS.find((x) => x.value === t)?.label ?? "Modbus TCP";
	type InverterStatus = {
		connected: boolean;
		simulate: boolean;
		lastError: string | null;
		lastSampleAt: string | null;
		profile: string;
	};

	let { status = null }: { status?: InverterStatus | null } = $props();

	type SnapshotMetric = {
		key: string;
		label: string;
		unit: string | null;
		group: string;
		value: number;
		display?: string;
	};

	let cfg = $state<InverterConfig | null>(null);
	let saving = $state(false);
	let testing = $state(false);
	let snapshotOpen = $state(false);
	let testResult = $state<{
		ok: boolean;
		error?: string;
		metricCount?: number;
		durationMs?: number;
		metrics?: SnapshotMetric[];
	} | null>(null);

	const result = $derived(
		testResult
			? {
					ok: testResult.ok,
					message: testResult.ok
						? `Connection OK — ${testResult.metricCount} metrics in ${testResult.durationMs} ms`
						: `Failed: ${testResult.error}`,
				}
			: null,
	);

	const hasSnapshot = $derived((testResult?.metrics?.length ?? 0) > 0);

	onMount(async () => {
		const { data } = await api.api.settings.inverter.get();
		// host may be empty when the inverter isn't configured yet; keep it a
		// string so the bound Input stays controlled.
		if (data) cfg = { ...data, host: data.host ?? "" };
	});

	async function test() {
		if (!cfg) return;
		testing = true;
		testResult = null;
		const { data, error } = await api.api.settings.inverter.test.post(cfg);
		testing = false;
		testResult = data ?? {
			ok: false,
			error: error ? String(error.value) : "Request failed",
		};
		// On success, surface the captured snapshot for a plausibility check.
		if (testResult.ok && (testResult.metrics?.length ?? 0) > 0) snapshotOpen = true;
	}

	async function save() {
		if (!cfg) return;
		saving = true;
		const { error } = await api.api.settings.inverter.put(cfg);
		saving = false;
		if (error) toast.error("Failed to save inverter settings");
		else toast.success("Inverter settings saved");
	}
</script>

{#if !cfg}
	<div
		class="flex h-40 items-center justify-center border border-border text-sm text-muted-foreground"
	>
		Loading…
	</div>
{:else}
	<SettingsSection title="Connection">
		{#snippet actions()}
			{#if status}
				<StatusBadge
					ok={status.connected}
					label={status.simulate
						? "Simulated"
						: status.connected
							? "Connected"
							: "Disconnected"}
				/>
			{/if}
		{/snippet}

		{#if status?.simulate}
			<p
				class="border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground"
			>
				Running in simulation mode (set by the <code>INVERTER_SIMULATE</code> environment
				variable). Connection settings below are saved but not used until simulation is
				turned off.
			</p>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<Label for="host">Host</Label>
				<Input id="host" bind:value={cfg.host} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="port">Port</Label>
				<Input id="port" type="number" bind:value={cfg.port} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>Transport</Label>
				<Select.Root
					type="single"
					value={cfg.transport}
					onValueChange={(v) => {
						if (cfg) cfg.transport = v as Transport;
					}}
				>
					<Select.Trigger>{transportLabel(cfg.transport)}</Select.Trigger>
					<Select.Content>
						{#each TRANSPORTS as t (t.value)}
							<Select.Item value={t.value}>{t.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="unit">Unit ID</Label>
				<Input id="unit" type="number" bind:value={cfg.unitId} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="timeout">Timeout (ms)</Label>
				<Input id="timeout" type="number" bind:value={cfg.timeoutMs} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="poll">Poll interval (ms)</Label>
				<Input
					id="poll"
					type="number"
					min={1000}
					step={1000}
					bind:value={cfg.pollIntervalMs}
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>Active profile</Label>
				<div
					class="flex h-9 items-center px-1 text-sm text-muted-foreground"
				>
					{status?.profile ?? "—"}
					<span class="ml-2 text-xs">(change requires restart)</span>
				</div>
			</div>
		</div>

		<FormActions {result} {testing} {saving} ontest={test} onsave={save}>
			{#if hasSnapshot}
				<Button variant="ghost" size="sm" onclick={() => (snapshotOpen = true)}>
					View snapshot
				</Button>
			{/if}
		</FormActions>
	</SettingsSection>

	<Dialog.Root bind:open={snapshotOpen}>
		<Dialog.Content class="sm:max-w-2xl">
			<Dialog.Header>
				<Dialog.Title>Captured snapshot</Dialog.Title>
				<Dialog.Description>
					{testResult?.metricCount} values read in {testResult?.durationMs} ms. Check
					them for plausibility before saving.
				</Dialog.Description>
			</Dialog.Header>
			<ScrollArea class="h-[60vh] w-full min-w-0 pr-3">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Metric</Table.Head>
							<Table.Head>Group</Table.Head>
							<Table.Head class="text-right">Value</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each testResult?.metrics ?? [] as m (m.key)}
							<Table.Row>
								<Table.Cell class="font-medium">{m.label}</Table.Cell>
								<Table.Cell class="text-muted-foreground">{m.group}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{#if m.display}
										{m.display}
										<span class="ml-1 text-xs text-muted-foreground">({m.value})</span>
									{:else}
										{m.value}{#if m.unit}&nbsp;{m.unit}{/if}
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</ScrollArea>
		</Dialog.Content>
	</Dialog.Root>
{/if}
