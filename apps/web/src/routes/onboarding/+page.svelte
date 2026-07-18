<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$lib/resolve';
	import * as Card from '$lib/components/ui/card';
	import { needsSetup } from '$lib/setup';
	import * as m from '$lib/paraglide/messages';
	import ShieldIcon from 'phosphor-svelte/lib/ShieldCheck';
	import AuthForm from '../../components/AuthForm.svelte';
	import AuthShell from '../../components/AuthShell.svelte';

	// First-run only: once an account exists, registration is closed.
	$effect(() => {
		needsSetup().then((setup) => {
			if (!setup) goto(resolve('/login'));
		});
	});
</script>

<AuthShell title={m.onboarding_title()} subtitle={m.onboarding_subtitle()}>
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<ShieldIcon class="size-5 text-primary" weight="fill" />
				{m.onboarding_create_admin()}
			</Card.Title>
			<Card.Description>
				{m.onboarding_admin_desc()}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<AuthForm mode="signup" />
		</Card.Content>
	</Card.Root>
</AuthShell>
