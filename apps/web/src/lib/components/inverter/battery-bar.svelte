<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { Progress } from '$lib/components/ui/progress';
	import AnimatedNumber from './animated-number.svelte';

	let {
		soc,
		power
	}: {
		soc: number | undefined;
		power: number | undefined;
	} = $props();

	// Sign convention (Deye register 590): power > 0 discharging, < 0 charging.
	const state = $derived(
		power === undefined || power === 0 ? 'Idle' : power > 0 ? 'Discharging' : 'Charging'
	);

	// Drive the bar with the same tween as the number (450ms cubicOut) so both
	// glide together. Only advance the target on a finite reading, so a tick that
	// omits SoC holds the last position instead of snapping to 0 and flickering.
	const socTween = new Tween(untrack(() => soc ?? 0), { duration: 450, easing: cubicOut });
	$effect(() => {
		if (soc !== undefined && Number.isFinite(soc)) socTween.target = soc;
	});
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-end justify-between gap-3">
		<div class="flex min-w-0 items-baseline gap-1.5">
			{#if soc === undefined}
				<span class="text-3xl font-semibold tabular-nums leading-none">—</span>
			{:else}
				<AnimatedNumber value={soc} class="text-3xl font-semibold tabular-nums leading-none" />
			{/if}
			<span class="text-sm text-muted-foreground">%</span>
		</div>
		<div class="min-w-0 text-right">
			<div class="text-xs uppercase tracking-wide text-muted-foreground">{state}</div>
			<div class="flex items-baseline justify-end gap-0.5 text-sm font-medium tabular-nums">
				{#if power === undefined || !Number.isFinite(power)}
					—
				{:else}
					<AnimatedNumber value={Math.abs(power)} unit="W" />
				{/if}
				<span class="text-muted-foreground">W</span>
			</div>
		</div>
	</div>
	<Progress
		value={socTween.current}
		max={100}
		class="**:data-[slot=progress-indicator]:transition-none"
	/>
</div>
