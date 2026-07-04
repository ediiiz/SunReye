<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { linear } from 'svelte/easing';
	import { configuredDecimals } from '$lib/inverter/format';

	let {
		value,
		unit = null,
		class: className = ''
	}: {
		value: number;
		/** Drives decimal precision via the per-unit config (e.g. `W` → no decimals). */
		unit?: string | null;
		class?: string;
	} = $props();

	// Seed at the first value (untracked), then continuously interpolate toward
	// each new live value. To read as a continuous realtime feed rather than a
	// once-a-second step, every transition is stretched to span the gap since the
	// previous update and eased linearly — so the number is always gently drifting
	// instead of snapping to the target and freezing until the next sample lands.
	const tween = new Tween(untrack(() => value));
	let lastAt = performance.now();
	$effect(() => {
		const v = value; // track live updates
		const now = performance.now();
		const gap = now - lastAt;
		lastAt = now;
		void tween.set(v, { duration: Math.min(2000, Math.max(300, gap)), easing: linear });
	});

	// Decimal places locked to a single count so the digit shape stays fixed
	// mid-tween — min = max — otherwise an intermediate frame could sprout an extra
	// decimal and make the text jump. A unit with a configured precision (e.g. `W`
	// → 0) wins; otherwise fall back to the *target* value's own places, floored at
	// 1 (so `2` reads `2.0`) and capped at 2.
	const decimals = $derived.by(() => {
		const fixed = configuredDecimals(unit);
		if (fixed !== undefined) return fixed;
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
