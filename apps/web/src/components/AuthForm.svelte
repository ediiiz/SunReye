<script lang="ts">
	import { z } from 'zod';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import AuthField from './AuthField.svelte';

	let { mode }: { mode: 'signin' | 'signup' } = $props();

	const schema = $derived(
		mode === 'signup'
			? z.object({
					name: z.string().min(2, 'Name must be at least 2 characters'),
					email: z.email('Invalid email address'),
					password: z.string().min(8, 'Password must be at least 8 characters')
				})
			: z.object({
					email: z.email('Invalid email address'),
					password: z.string().min(1, 'Password is required')
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
				formError = error.error.message || 'Something went wrong. Please try again.';
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
			label="Name"
			autocomplete="name"
			placeholder="Ada Lovelace"
			error={errors.name}
			bind:value={name}
		/>
	{/if}
	<AuthField
		id="email"
		label="Email"
		type="email"
		autocomplete="email"
		placeholder="you@example.com"
		error={errors.email}
		bind:value={email}
	/>
	<AuthField
		id="password"
		label="Password"
		type="password"
		autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
		placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
		error={errors.password}
		bind:value={password}
	/>

	{#if formError}
		<p class="text-sm text-destructive" role="alert">{formError}</p>
	{/if}

	<Button type="submit" class="w-full" disabled={submitting}>
		{#if submitting}
			{mode === 'signup' ? 'Creating account…' : 'Signing in…'}
		{:else}
			{mode === 'signup' ? 'Create account' : 'Sign in'}
		{/if}
	</Button>
</form>
