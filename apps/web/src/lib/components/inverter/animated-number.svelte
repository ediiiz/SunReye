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

	// Decimal places of the *target* value, floored at 1 (so `2` reads `2.0`) and
	// capped at 2. Locking every frame to this exact count — min = max — keeps the
	// digit shape fixed mid-tween, so intermediate frames can't sprout an extra
	// decimal and make the text jump.
	const decimals = $derived.by(() => {
		if (Number.isInteger(value)) return 1;
		const dot = String(value).indexOf('.');
		const places = dot === -1 ? 0 : String(value).length - dot - 1;
		return Math.min(Math.max(places, 1), 2);
	});
	const display = $derived(
		tween.current.toLocaleString(undefined, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		})
	);
</script>

<span class={className}>{display}</span>
