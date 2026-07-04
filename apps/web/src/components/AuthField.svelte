<script lang="ts">
	import type { HTMLInputTypeAttribute } from 'svelte/elements';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let {
		id,
		label,
		type = 'text',
		autocomplete,
		placeholder,
		error,
		value = $bindable('')
	}: {
		id: string;
		label: string;
		type?: HTMLInputTypeAttribute;
		autocomplete?: HTMLInputElement['autocomplete'];
		placeholder?: string;
		error?: string;
		value?: string;
	} = $props();
</script>

<div class="flex flex-col gap-1.5">
	<Label for={id}>{label}</Label>
	<Input {id} {type} {autocomplete} {placeholder} aria-invalid={!!error} bind:value />
	{#if error}<p class="text-xs text-destructive" role="alert">{error}</p>{/if}
</div>
