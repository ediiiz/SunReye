<script lang="ts">
	import { createForm } from '@tanstack/svelte-form';
	import { z } from 'zod';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';

	let { switchToSignUp }: { switchToSignUp: () => void } = $props();

	let formError = $state('');

	const validationSchema = z.object({
		email: z.email('Invalid email address'),
		password: z.string().min(1, 'Password is required')
	});

	const form = createForm(() => ({
		defaultValues: { email: '', password: '' },
		onSubmit: async ({ value }) => {
			formError = '';
			await authClient.signIn.email(
				{ email: value.email, password: value.password },
				{
					onSuccess: () => goto('/'),
					onError: (error) => {
						formError = error.error.message || 'Sign in failed. Please try again.';
					}
				}
			);
		},
		validators: { onSubmit: validationSchema }
	}));

	type SubmitState = Pick<typeof form.state, 'canSubmit' | 'isSubmitting'>;
</script>

<form
	class="flex flex-col gap-4"
	onsubmit={(e) => {
		e.preventDefault();
		e.stopPropagation();
		form.handleSubmit();
	}}
>
	<form.Field name="email">
		{#snippet children(field)}
			<div class="flex flex-col gap-1.5">
				<Label for={field.name}>Email</Label>
				<Input
					id={field.name}
					name={field.name}
					type="email"
					autocomplete="email"
					placeholder="you@example.com"
					aria-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
					onblur={field.handleBlur}
					value={field.state.value}
					oninput={(e) => field.handleChange(e.currentTarget.value)}
				/>
				{#if field.state.meta.isTouched}
					{#each field.state.meta.errors as error (error)}
						<p class="text-xs text-destructive" role="alert">{error}</p>
					{/each}
				{/if}
			</div>
		{/snippet}
	</form.Field>

	<form.Field name="password">
		{#snippet children(field)}
			<div class="flex flex-col gap-1.5">
				<Label for={field.name}>Password</Label>
				<Input
					id={field.name}
					name={field.name}
					type="password"
					autocomplete="current-password"
					placeholder="••••••••"
					aria-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}
					onblur={field.handleBlur}
					value={field.state.value}
					oninput={(e) => field.handleChange(e.currentTarget.value)}
				/>
				{#if field.state.meta.isTouched}
					{#each field.state.meta.errors as error (error)}
						<p class="text-xs text-destructive" role="alert">{error}</p>
					{/each}
				{/if}
			</div>
		{/snippet}
	</form.Field>

	{#if formError}
		<p class="text-sm text-destructive" role="alert">{formError}</p>
	{/if}

	<form.Subscribe
		selector={(state: typeof form.state): SubmitState => ({
			canSubmit: state.canSubmit,
			isSubmitting: state.isSubmitting
		})}
	>
		{#snippet children(state: SubmitState)}
			<Button type="submit" class="w-full" disabled={!state.canSubmit || state.isSubmitting}>
				{state.isSubmitting ? 'Signing in…' : 'Sign in'}
			</Button>
		{/snippet}
	</form.Subscribe>
</form>

<p class="mt-4 text-center text-sm text-muted-foreground">
	Need an account?
	<button type="button" class="font-medium text-primary hover:underline" onclick={switchToSignUp}>
		Create one
	</button>
</p>
