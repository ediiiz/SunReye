<script lang="ts">
	import { Axis } from 'layerchart';
	import { axisScale } from '$lib/inverter/chart-axes';

	// Independent left/right y-axes for a dual-unit custom chart. Rendered inside the
	// chart's `marks` (it needs the resolved plot `height` from context) with real
	// d3 scales, so the tick labels show each unit's true values while the series
	// plot on the shared normalized [0,1] scale underneath.
	let {
		height,
		left,
		right,
		leftUnit,
		rightUnit
	}: {
		height: number;
		left: [number, number];
		right: [number, number] | null;
		leftUnit?: string;
		rightUnit?: string;
	} = $props();

	const leftScale = $derived(axisScale(left, height));
	const rightScale = $derived(right ? axisScale(right, height) : null);
	const fmt = (v: unknown) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
</script>

<Axis
	placement="left"
	scale={leftScale}
	grid
	rule={false}
	ticks={5}
	format={fmt}
	label={leftUnit || undefined}
/>
{#if rightScale}
	<Axis
		placement="right"
		scale={rightScale}
		rule={false}
		ticks={5}
		format={fmt}
		label={rightUnit || undefined}
	/>
{/if}
