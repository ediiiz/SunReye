<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	let {
		value,
		class: className = ''
	}: {
		value: number;
		class?: string;
	} = $props();

	// Seed at the first value (untracked), then smoothly interpolate toward each
	// subsequent live value.
	const tween = new Tween(untrack(() => value), { duration: 450, easing: cubicOut });
	$effect(() => {
		tween.target = value;
	});

	// Integer targets count in whole units; fractional targets keep 1–2 places so
	// the animation never flickers spurious decimals on a value meant to be whole.
	const display = $derived(
		Number.isInteger(value)
			? Math.round(tween.current).toLocaleString()
			: tween.current.toLocaleString(undefined, { maximumFractionDigits: 2 })
	);
</script>

<span class={className}>{display}</span>
