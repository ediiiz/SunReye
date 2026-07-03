<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { authClient } from '$lib/auth-client';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';

	const sessionQuery = authClient.useSession();

	type MetricDef = {
		key: string;
		label: string;
		unit: string | null;
		group: string;
		kind: string;
		writable: boolean;
		role?: string;
	};
	type Profile = {
		id: string;
		name: string;
		manufacturer: string;
		capabilities: unknown;
		metrics: MetricDef[];
	};
	type Sample = { time: string; inverterId: string; metrics: Record<string, number> };

	let profile = $state<Profile | null>(null);
	let latest = $state<Sample | null>(null);

	$effect(() => {
		if (!$sessionQuery.isPending && !$sessionQuery.data) goto('/login');
	});

	// Metric catalog for the active inverter profile (labels, units, grouping).
	$effect(() => {
		api.api.profile.get().then(({ data }) => {
			if (data) profile = data;
		});
	});

	// Live metrics stream from the ElysiaJS core engine (Eden Treaty WebSocket).
	$effect(() => {
		const ws = api.ws.metrics.subscribe();
		ws.subscribe((message) => {
			latest = message.data as Sample;
		});
		return () => ws.close();
	});

	const GROUP_ORDER = ['inverter', 'battery', 'load', 'generator', 'settings', 'timeofuse', 'system'];

	const groups = $derived.by(() => {
		if (!profile) return [];
		const byGroup = new Map<string, MetricDef[]>();
		for (const m of profile.metrics) {
			const list = byGroup.get(m.group) ?? [];
			list.push(m);
			byGroup.set(m.group, list);
		}
		return [...byGroup.entries()].sort(
			([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)
		);
	});

	function fmt(key: string): string {
		const v = latest?.metrics[key];
		if (v === undefined) return '—';
		return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
	}

	const HEADLINE: { key: string; label: string; unit: string }[] = [
		{ key: 'dc.total_power', label: 'PV Power', unit: 'W' },
		{ key: 'battery.soc', label: 'Battery SOC', unit: '%' },
		{ key: 'battery.power', label: 'Battery Power', unit: 'W' },
		{ key: 'ac.total_power', label: 'Grid Power', unit: 'W' },
		{ key: 'ac.ups.total_power', label: 'Load Power', unit: 'W' },
		{ key: 'day_energy', label: 'Daily Production', unit: 'kWh' }
	];
</script>

{#if $sessionQuery.isPending}
	<div class="p-8 text-muted-foreground">Loading…</div>
{:else if !$sessionQuery.data}
	<div class="p-8 text-muted-foreground">Redirecting to login…</div>
{:else}
	<div class="mx-auto max-w-6xl space-y-6 p-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight">Inverter Dashboard</h1>
				<p class="text-sm text-muted-foreground">
					{#if profile}{profile.manufacturer} · {profile.name}{:else}Loading profile…{/if}
				</p>
			</div>
			<Badge variant={latest ? 'default' : 'secondary'}>{latest ? 'Live' : 'Waiting…'}</Badge>
		</div>

		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
			{#each HEADLINE as h (h.key)}
				<Card.Root>
					<Card.Header class="pb-2">
						<Card.Description>{h.label}</Card.Description>
						<Card.Title class="text-2xl tabular-nums">{fmt(h.key)}</Card.Title>
					</Card.Header>
					<Card.Content class="pt-0 text-xs text-muted-foreground">{h.unit}</Card.Content>
				</Card.Root>
			{/each}
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			{#each groups as [group, metrics] (group)}
				<Card.Root>
					<Card.Header>
						<Card.Title class="capitalize">{group}</Card.Title>
					</Card.Header>
					<Card.Content>
						<Table.Root>
							<Table.Body>
								{#each metrics as m (m.key)}
									<Table.Row>
										<Table.Cell class="text-muted-foreground">{m.label}</Table.Cell>
										<Table.Cell class="text-right tabular-nums font-medium">{fmt(m.key)}</Table.Cell>
										<Table.Cell class="w-12 text-xs text-muted-foreground">{m.unit ?? ''}</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	</div>
{/if}
