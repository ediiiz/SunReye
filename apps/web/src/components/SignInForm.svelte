<script lang="ts">
	import { z } from 'zod';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';

	let { switchToSignUp }: { switchToSignUp: () => void } = $props();

	const schema = z.object({
		email: z.email('Invalid email address'),
		password: z.string().min(1, 'Password is required')
	});

	let email = $state('');
	let password = $state('');
	let errors = $state<{ email?: string; password?: string }>({});
	let formError = $state('');
	let submitting = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		formError = '';
		const parsed = schema.safeParse({ email, password });
		if (!parsed.success) {
			errors = z.flattenError(parsed.error).fieldErrors as typeof errors;
			return;
		}
		errors = {};
		submitting = true;
		await authClient.signIn.email(parsed.data, {
			onSuccess: () => goto('/'),
			onError: (error) => {
				formError = error.error.message || 'Sign in failed. Please try again.';
			}
		});
		submitting = false;
	}
</script>

<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
	<div class="flex flex-col gap-1.5">
		<Label for="email">Email</Label>
		<Input
			id="email"
			type="email"
			autocomplete="email"
			placeholder="you@example.com"
			aria-invalid={!!errors.email}
			bind:value={email}
		/>
		{#if errors.email}<p class="text-xs text-destructive" role="alert">{errors.email}</p>{/if}
	</div>

	<div class="flex flex-col gap-1.5">
		<Label for="password">Password</Label>
		<Input
			id="password"
			type="password"
			autocomplete="current-password"
			placeholder="••••••••"
			aria-invalid={!!errors.password}
			bind:value={password}
		/>
		{#if errors.password}<p class="text-xs text-destructive" role="alert">{errors.password}</p>{/if}
	</div>

	{#if formError}
		<p class="text-sm text-destructive" role="alert">{formError}</p>
	{/if}

	<Button type="submit" class="w-full" disabled={submitting}>
		{submitting ? 'Signing in…' : 'Sign in'}
	</Button>
</form>

<p class="mt-4 text-center text-sm text-muted-foreground">
	Need an account?
	<button type="button" class="font-medium text-primary hover:underline" onclick={switchToSignUp}>
		Create one
	</button>
</p>
