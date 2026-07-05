<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { needsSetup } from '$lib/setup';
	import LightningIcon from 'phosphor-svelte/lib/Lightning';
	import ShieldIcon from 'phosphor-svelte/lib/ShieldCheck';
	import AuthForm from '../../components/AuthForm.svelte';

	// First-run only: once an account exists, registration is closed.
	$effect(() => {
		needsSetup().then((setup) => {
			if (!setup) goto('/login');
		});
	});
</script>

<div class="relative grid min-h-svh place-items-center overflow-hidden bg-background p-4">
	<!-- Faint blueprint grid; industrial-console backdrop. -->
	<div
		class="pointer-events-none absolute inset-0 opacity-[0.35] bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-size-[44px_44px] mask-[radial-gradient(ellipse_at_center,black,transparent_75%)]"
		aria-hidden="true"
	></div>

	<div
		class="relative flex w-full max-w-sm flex-col gap-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
	>
		<div class="flex flex-col items-center gap-3 text-center">
			<div class="flex size-11 items-center justify-center bg-primary text-primary-foreground">
				<LightningIcon class="size-6" weight="fill" />
			</div>
			<div>
				<h1 class="text-xl font-semibold tracking-tight">Welcome to SunReye</h1>
				<p class="text-sm text-muted-foreground">Set up your instance</p>
			</div>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<ShieldIcon class="size-5 text-primary" weight="fill" />
					Create the administrator
				</Card.Title>
				<Card.Description>
					This is the first account, so it becomes the administrator. Registration closes once
					it's created — add further users from Settings.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<AuthForm mode="signup" />
			</Card.Content>
		</Card.Root>
	</div>
</div>
