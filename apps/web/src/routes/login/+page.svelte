<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import LightningIcon from 'phosphor-svelte/lib/Lightning';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
	import SignInForm from '../../components/SignInForm.svelte';
	import SignUpForm from '../../components/SignUpForm.svelte';

	let showSignIn = $state(true);
</script>

<div class="relative grid min-h-svh place-items-center overflow-hidden bg-background p-4">
	<!-- Faint blueprint grid; industrial-console backdrop. -->
	<div
		class="pointer-events-none absolute inset-0 opacity-[0.35] bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-size-[44px_44px] mask-[radial-gradient(ellipse_at_center,black,transparent_75%)]"
		aria-hidden="true"
	></div>

	<div class="relative flex w-full max-w-sm flex-col gap-6">
		<div class="flex flex-col items-center gap-3 text-center">
			<div class="flex size-11 items-center justify-center bg-primary text-primary-foreground">
				<LightningIcon class="size-6" weight="fill" />
			</div>
			<div>
				<h1 class="text-xl font-semibold tracking-tight">ReyeON</h1>
				<p class="text-sm text-muted-foreground">Modbus inverter monitoring</p>
			</div>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>{showSignIn ? 'Sign in' : 'Create account'}</Card.Title>
				<Card.Description>
					{showSignIn
						? 'Enter your credentials to access the console.'
						: 'Register to start monitoring your inverter.'}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if showSignIn}
					<SignInForm switchToSignUp={() => (showSignIn = false)} />
				{:else}
					<SignUpForm switchToSignIn={() => (showSignIn = true)} />
				{/if}
			</Card.Content>
		</Card.Root>

		{#if dev}
			<Button variant="outline" class="w-full" onclick={() => goto('/')}>
				Continue as developer
				<ArrowRightIcon class="size-4" />
			</Button>
		{/if}
	</div>
</div>
