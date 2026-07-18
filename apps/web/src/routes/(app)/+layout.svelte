<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve, routePath } from '$lib/resolve';
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';
	import { MediaQuery } from 'svelte/reactivity';
	import { toggleMode } from 'mode-watcher';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { useAppSession } from '$lib/session';
	import { firstRunGate, type FirstRunGate } from '$lib/setup';
	import { inverter } from '$lib/inverter/store.svelte';
	import { display } from '$lib/display.svelte';
	import * as m from '$lib/paraglide/messages';
	import SunIcon from 'phosphor-svelte/lib/Sun';
	import MoonIcon from 'phosphor-svelte/lib/Moon';

	const { children } = $props();

	const sessionQuery = useAppSession();

	// The hash router pins `page.url.pathname` to the served document path, so
	// the active route has to come from the hash (see `routePath`).
	const current = $derived(routePath(page.url));

	// The top-level section, e.g. '/settings/inverter' → '/settings'. Drives the
	// header title, the admin guard, and the content transition so that moving
	// between a section's subroutes (Settings panels) keeps the shell — and the
	// section's own nav rail — stable instead of re-fading the whole area.
	const topSegment = $derived('/' + (current.split('/')[1] ?? ''));

	// Client-side guard (matches the existing app auth pattern).
	$effect(() => {
		if (!$sessionQuery.isPending && !$sessionQuery.data) goto(resolve('/login'));
	});

	// First-run gate, in precedence order: no admin yet → `/onboarding`; admin but
	// no active profile (server booted onboarding-only, so there's no manifest or
	// live data) → `/setup`; otherwise render the workspace. `gate` is null until
	// the check resolves, so the shell never flashes before we know where to go.
	let gate = $state<FirstRunGate | null>(null);
	$effect(() => {
		if ($sessionQuery.isPending || !$sessionQuery.data || gate) return;
		firstRunGate().then((g) => {
			gate = g;
			if (g === 'setup-account') goto(resolve('/onboarding'));
			else if (g === 'setup-profile') goto(resolve('/setup'));
		});
	});

	// Admin-only areas (Settings + Controls). The server enforces every mutation;
	// this bounces non-admins who reach the page by direct URL. The nav hides
	// these entries too (app-sidebar.svelte).
	const ADMIN_ONLY = ['/settings', '/controls'];
	$effect(() => {
		if ($sessionQuery.isPending || !$sessionQuery.data) return;
		if ($sessionQuery.data.user?.role !== 'admin' && ADMIN_ONLY.includes(topSegment)) {
			goto(resolve('/'));
		}
	});

	// Open the manifest + live stream once the instance is fully configured
	// (skipped in onboarding-only boot, where `/api/profile` has no manifest).
	$effect(() => {
		if (gate === 'ready') {
			inverter.start();
			// Load the instance-wide clock/time-zone preference so charts render in
			// the configured format from first paint.
			display.load();
		}
	});

	const SECTION: Record<string, () => string> = {
		'/': m.nav_overview,
		'/system': m.nav_system,
		'/history': m.nav_history,
		'/costs': m.nav_costs,
		'/controls': m.nav_controls,
		'/settings': m.nav_settings
	};
	const section = $derived((SECTION[topSegment] ?? m.nav_overview)());

	// Subtle route-to-route motion: the shell (sidebar + header) stays put while
	// the inner content cross-fades up on each navigation. Honour reduced-motion.
	const reduceMotion = new MediaQuery('prefers-reduced-motion: reduce');
	const contentIn = $derived(reduceMotion.current ? { duration: 0 } : { duration: 200 });
	const titleIn = $derived(reduceMotion.current ? { duration: 0 } : { duration: 200 });
</script>

{#if $sessionQuery.isPending}
	<div class="grid h-svh place-items-center text-muted-foreground">{m.app_loading()}</div>
{:else if !$sessionQuery.data}
	<div class="grid h-svh place-items-center text-muted-foreground">{m.app_redirecting_login()}</div>
{:else if gate === null}
	<div class="grid h-svh place-items-center text-muted-foreground">{m.app_loading()}</div>
{:else if gate !== 'ready'}
	<div class="grid h-svh place-items-center text-muted-foreground">{m.app_redirecting()}</div>
{:else}
	<Sidebar.Provider>
		<AppSidebar />
		<Sidebar.Inset>
			<header
				class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4"
			>
				<Sidebar.Trigger />
				<div class="flex items-center gap-2 text-sm">
					<span class="text-muted-foreground">{m.nav_monitoring()}</span>
					<span class="text-muted-foreground">/</span>
					{#key section}
						<span class="font-medium" in:fade={titleIn}>{section}</span>
					{/key}
				</div>
				<div class="ml-auto flex items-center gap-2">
					<Badge variant={inverter.status === 'live' ? 'default' : 'secondary'}>
						{inverter.status === 'live' ? m.status_live() : m.status_connecting()}
					</Badge>
					<Button variant="ghost" size="icon" onclick={toggleMode} aria-label={m.action_toggle_theme()}>
						<SunIcon class="size-4 dark:hidden" />
						<MoonIcon class="hidden size-4 dark:block" />
					</Button>
				</div>
			</header>
			<main class="min-h-0 flex-1 overflow-y-auto">
				{#key topSegment}
					<div in:fade={contentIn}>
						{@render children()}
					</div>
				{/key}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
