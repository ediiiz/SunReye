<script lang="ts">
	import type { Component } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { authClient } from '$lib/auth-client';
	import { useAppSession } from '$lib/session';
	import { inverter } from '$lib/inverter/store.svelte';
	import GaugeIcon from 'phosphor-svelte/lib/Gauge';
	import ChartLineIcon from 'phosphor-svelte/lib/ChartLine';
	import SlidersIcon from 'phosphor-svelte/lib/SlidersHorizontal';
	import LightningIcon from 'phosphor-svelte/lib/Lightning';
	import SignOutIcon from 'phosphor-svelte/lib/SignOut';
	import UserIcon from 'phosphor-svelte/lib/User';

	const sessionQuery = useAppSession();

	type NavItem = { href: string; label: string; icon: Component };

	const items = $derived<NavItem[]>([
		{ href: '/', label: 'Overview', icon: GaugeIcon },
		{ href: '/history', label: 'History', icon: ChartLineIcon },
		...((inverter.capabilities?.controls.length ?? 0) > 0
			? [{ href: '/controls', label: 'Controls', icon: SlidersIcon }]
			: [])
	]);

	const userName = $derived(
		$sessionQuery.data?.user?.name ||
			$sessionQuery.data?.user?.email?.split('@')[0] ||
			'Signed in'
	);
	const isDev = $derived($sessionQuery.isDev);

	async function signOut() {
		if (isDev) {
			await goto('/login');
			return;
		}
		await authClient.signOut({ fetchOptions: { onSuccess: () => goto('/login') } });
	}
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<div class="flex items-center gap-2 px-1 py-1.5">
			<div class="flex size-8 shrink-0 items-center justify-center bg-primary text-primary-foreground">
				<LightningIcon class="size-5" weight="fill" />
			</div>
			<div class="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
				<span class="text-sm font-semibold leading-tight">ReyeON</span>
				<span class="truncate text-xs text-muted-foreground">
					{inverter.manifest
						? `${inverter.manifest.manufacturer} · ${inverter.manifest.name}`
						: 'Loading…'}
				</span>
			</div>
		</div>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Monitoring</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each items as item (item.href)}
						{@const Icon = item.icon}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={page.url.pathname === item.href}>
								{#snippet child({ props })}
									<a href={item.href} {...props}>
										<Icon class="size-4" />
										<span>{item.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<div
					class="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden"
				>
					<UserIcon class="size-4 shrink-0" />
					<span class="truncate">{userName}</span>
					{#if isDev}
						<span class="shrink-0 bg-primary/15 px-1 text-[10px] font-medium uppercase text-primary">
							dev
						</span>
					{/if}
				</div>
			</Sidebar.MenuItem>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton>
					{#snippet child({ props })}
						<button type="button" onclick={signOut} {...props}>
							<SignOutIcon class="size-4" />
							<span>Sign out</span>
						</button>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
