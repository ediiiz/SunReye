<script lang="ts">
	import { z } from 'zod';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';

	let { switchToSignIn }: { switchToSignIn: () => void } = $props();

	const schema = z.object({
		name: z.string().min(2, 'Name must be at least 2 characters'),
		email: z.email('Invalid email address'),
		password: z.string().min(8, 'Password must be at least 8 characters')
	});

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
			errors = z.flattenError(parsed.error).fieldErrors as typeof errors;
			return;
		}
		errors = {};
		submitting = true;
		await authClient.signUp.email(parsed.data, {
			onSuccess: () => goto('/'),
			onError: (error) => {
				formError = error.error.message || 'Sign up failed. Please try again.';
			}
		});
		submitting = false;
	}
</script>

<form class="flex flex-col gap-4" onsubmit={handleSubmit}>
	<div class="flex flex-col gap-1.5">
		<Label for="name">Name</Label>
		<Input
			id="name"
			autocomplete="name"
			placeholder="Ada Lovelace"
			aria-invalid={!!errors.name}
			bind:value={name}
		/>
		{#if errors.name}<p class="text-xs text-destructive" role="alert">{errors.name}</p>{/if}
	</div>

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
			autocomplete="new-password"
			placeholder="At least 8 characters"
			aria-invalid={!!errors.password}
			bind:value={password}
		/>
		{#if errors.password}<p class="text-xs text-destructive" role="alert">{errors.password}</p>{/if}
	</div>

	{#if formError}
		<p class="text-sm text-destructive" role="alert">{formError}</p>
	{/if}

	<Button type="submit" class="w-full" disabled={submitting}>
		{submitting ? 'Creating account…' : 'Create account'}
	</Button>
</form>

<p class="mt-4 text-center text-sm text-muted-foreground">
	Already have an account?
	<button type="button" class="font-medium text-primary hover:underline" onclick={switchToSignIn}>
		Sign in
	</button>
</p>
