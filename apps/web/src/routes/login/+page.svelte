<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$lib/resolve';
	import * as Card from '$lib/components/ui/card';
	import { needsSetup } from '$lib/setup';
	import * as m from '$lib/paraglide/messages';
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

<AuthShell title="SunReye" subtitle={m.brand_tagline()}>
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.login_title()}</Card.Title>
			<Card.Description>{m.login_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<AuthForm mode="signin" />
		</Card.Content>
	</Card.Root>
</AuthShell>
