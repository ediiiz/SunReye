<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { needsSetup } from '$lib/setup';
	import ShieldIcon from 'phosphor-svelte/lib/ShieldCheck';
	import AuthForm from '../../components/AuthForm.svelte';
	import AuthShell from '../../components/AuthShell.svelte';

	// First-run only: once an account exists, registration is closed.
	$effect(() => {
		needsSetup().then((setup) => {
			if (!setup) goto('/login');
		});
	});
</script>

<AuthShell title="Welcome to SunReye" subtitle="Set up your instance">
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
</AuthShell>
