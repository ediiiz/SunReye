<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toggleMode } from 'mode-watcher';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { authClient } from '$lib/auth-client';
	import { inverter } from '$lib/inverter/store.svelte';
	import SunIcon from 'phosphor-svelte/lib/Sun';
	import MoonIcon from 'phosphor-svelte/lib/Moon';

	const { children } = $props();

	const sessionQuery = authClient.useSession();

	// Client-side guard (matches the existing app auth pattern).
	$effect(() => {
		if (!$sessionQuery.isPending && !$sessionQuery.data) goto('/login');
	});

	// Open the manifest + live stream once the workspace mounts.
	$effect(() => {
		inverter.start();
	});

	const SECTION: Record<string, string> = {
		'/': 'Overview',
		'/history': 'History',
		'/controls': 'Controls'
	};
	const section = $derived(SECTION[page.url.pathname] ?? 'Overview');
</script>

{#if $sessionQuery.isPending}
	<div class="grid h-svh place-items-center text-muted-foreground">Loading…</div>
{:else if !$sessionQuery.data}
	<div class="grid h-svh place-items-center text-muted-foreground">Redirecting to login…</div>
{:else}
	<Sidebar.Provider>
		<AppSidebar />
		<Sidebar.Inset>
			<header
				class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4"
			>
				<Sidebar.Trigger />
				<div class="flex items-center gap-2 text-sm">
					<span class="text-muted-foreground">Monitoring</span>
					<span class="text-muted-foreground">/</span>
					<span class="font-medium">{section}</span>
				</div>
				<div class="ml-auto flex items-center gap-2">
					<Badge variant={inverter.status === 'live' ? 'default' : 'secondary'}>
						{inverter.status === 'live' ? 'Live' : 'Connecting…'}
					</Badge>
					<Button variant="ghost" size="icon" onclick={toggleMode} aria-label="Toggle theme">
						<SunIcon class="size-4 dark:hidden" />
						<MoonIcon class="hidden size-4 dark:block" />
					</Button>
				</div>
			</header>
			<main class="min-h-0 flex-1 overflow-y-auto">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
