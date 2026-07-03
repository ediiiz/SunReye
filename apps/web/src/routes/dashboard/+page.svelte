<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { authClient } from '$lib/auth-client';

	const sessionQuery = authClient.useSession();

	type Metrics = { time: string; pvPowerW: number; batterySoc: number; gridPowerW: number };
	let latest = $state<Metrics | null>(null);

	$effect(() => {
		if (!$sessionQuery.isPending && !$sessionQuery.data) {
			goto('/login');
		}
	});

	// Live metrics stream from the ElysiaJS core engine (Eden Treaty WebSocket).
	$effect(() => {
		const ws = api.ws.metrics.subscribe();
		ws.subscribe((message) => {
			latest = message.data as Metrics;
		});
		return () => ws.close();
	});
</script>

{#if $sessionQuery.isPending}
	<div>Loading...</div>
{:else if !$sessionQuery.data}
	<div>Redirecting to login...</div>
{:else}
	<div>
		<h1>Dashboard</h1>
		<p>Welcome {$sessionQuery.data.user.name}</p>
		{#if latest}
			<ul>
				<li>PV power: {latest.pvPowerW} W</li>
				<li>Battery SOC: {latest.batterySoc} %</li>
				<li>Grid power: {latest.gridPowerW} W</li>
			</ul>
		{:else}
			<p>Waiting for live metrics…</p>
		{/if}
	</div>
{/if}
