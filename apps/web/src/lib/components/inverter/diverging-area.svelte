<script lang="ts">
	import { Area, LinearGradient } from 'layerchart';
	import { curveCatmullRom } from 'd3-shape';

	// Diverging semantics: above 0 = consumption (red), below 0 = export (green).
	const IMPORT_COLOR = 'oklch(0.63 0.21 25)';
	const EXPORT_COLOR = 'oklch(0.7 0.16 152)';

	let {
		context
	}: {
		/** The AreaChart `marks` context; only the fields needed for the zero stop. */
		context: { yScale: (v: number) => number; height: number; padding: { bottom: number } };
	} = $props();

	const zero = $derived(context.yScale(0) / (context.height + context.padding.bottom));
</script>

<LinearGradient
	vertical
	stops={[
		[0, IMPORT_COLOR],
		[zero, IMPORT_COLOR],
		[zero, EXPORT_COLOR],
		[1, EXPORT_COLOR]
	]}
>
	{#snippet children({ gradient })}
		<Area
			y0={() => 0}
			curve={curveCatmullRom}
			line={{ stroke: gradient, 'stroke-width': 1.5 }}
			fill={gradient}
			fillOpacity={0.25}
		/>
	{/snippet}
</LinearGradient>
