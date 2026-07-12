<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$lib/resolve';
	import * as Card from '$lib/components/ui/card';
	import { needsSetup } from '$lib/setup';
	import AuthForm from '../../components/AuthForm.svelte';
	import AuthShell from '../../components/AuthShell.svelte';

	// First-run: no account yet → send visitors to admin onboarding. Registration
	// is otherwise closed (invite-only), so this page is sign-in only.
	$effect(() => {
		needsSetup().then((setup) => {
			if (setup) goto(resolve('/onboarding'));
		});
	});
</script>

<AuthShell title="SunReye" subtitle="Modbus inverter monitoring">
	<Card.Root>
		<Card.Header>
			<Card.Title>Sign in</Card.Title>
			<Card.Description>Enter your credentials to access the console.</Card.Description>
		</Card.Header>
		<Card.Content>
			<AuthForm mode="signin" />
		</Card.Content>
	</Card.Root>
</AuthShell>
