<script lang="ts">
	import { z } from 'zod';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { resolve } from '$lib/resolve';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages';
	import AuthField from './AuthField.svelte';

	let { mode }: { mode: 'signin' | 'signup' } = $props();

	const schema = $derived(
		mode === 'signup'
			? z.object({
					name: z.string().min(2, m.auth_name_min()),
					email: z.email(m.auth_email_invalid()),
					password: z.string().min(8, m.auth_password_min())
				})
			: z.object({
					email: z.email(m.auth_email_invalid()),
					password: z.string().min(1, m.auth_password_required())
				})
	);

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let errors = $state<{ name?: string; email?: string; password?: string }>({});
	let formError = $state('');
	let submitting = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		formError = '';
		const parsed = schema.safeParse({ name, email, password });
		if (!parsed.success) {
			const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
			errors = { name: fieldErrors.name?.[0], email: fieldErrors.email?.[0], password: fieldErrors.password?.[0] };
			return;
		}
		errors = {};
		submitting = true;
		const opts = {
			onSuccess: () => goto(resolve('/')),
			onError: (error: { error: { message?: string } }) => {
				formError = error.error.message || m.auth_error_generic();
			}
		};
		if (mode === 'signup') {
			await authClient.signUp.email({ name, email, password }, opts);
		} else {
			await authClient.signIn.email({ email, password }, opts);
		}
		submitting = false;
	}
</script>

<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
	{#if mode === 'signup'}
		<AuthField
			id="name"
			label={m.auth_field_name()}
			autocomplete="name"
			placeholder="Ada Lovelace"
			error={errors.name}
			bind:value={name}
		/>
	{/if}
	<AuthField
		id="email"
		label={m.auth_field_email()}
		type="email"
		autocomplete="email"
		placeholder="you@example.com"
		error={errors.email}
		bind:value={email}
	/>
	<AuthField
		id="password"
		label={m.auth_field_password()}
		type="password"
		autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
		placeholder={mode === 'signup' ? m.auth_placeholder_password_new() : '••••••••'}
		error={errors.password}
		bind:value={password}
	/>

	{#if formError}
		<p class="text-sm text-destructive" role="alert">{formError}</p>
	{/if}

	<Button type="submit" class="w-full" disabled={submitting}>
		{#if submitting}
			{mode === 'signup' ? m.auth_creating_account() : m.auth_signing_in()}
		{:else}
			{mode === 'signup' ? m.auth_create_account() : m.login_title()}
		{/if}
	</Button>
</form>
