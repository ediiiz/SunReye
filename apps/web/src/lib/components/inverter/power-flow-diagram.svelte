<script lang="ts">
	import CpuIcon from 'phosphor-svelte/lib/Cpu';
	import GaugeIcon from 'phosphor-svelte/lib/Gauge';
	import type { CanonicalRole } from '$lib/inverter/types';
	import AnimatedNumber from './animated-number.svelte';
	import PowerFlowNode from './power-flow-node.svelte';
	import { inverter } from '$lib/inverter/store.svelte';
	import { buildPowerGraph, type Flow, type Pt } from '$lib/inverter/power-graph';

	function power(role: CanonicalRole, index?: number): number | undefined {
		const m = inverter.byRole(role, index);
		return m ? inverter.value(m.key) : undefined;
	}

	const caps = $derived(inverter.capabilities);

	// Computed metrics shown on the hub itself: self-consumption (conversion
	// losses + standby draw) and the share of drawn power that reaches the load.
	const selfUse = $derived(power('inverter.power'));
	const efficiency = $derived(power('inverter.efficiency'));

	// Battery state-of-charge (0..100) drives the circular gauge on the battery node.
	const batterySoc = $derived.by(() => {
		const m = inverter.byRole('battery.soc');
		const v = m ? inverter.value(m.key) : undefined;
		return v === undefined ? undefined : Math.min(100, Math.max(0, v));
	});

	// Connector paths must render in real pixels, so bind the rendered size and
	// project the fractional anchors into it. The aspect ratio picks the layout:
	// tall boxes (phones) stack the diagram, wide ones (tablets/walls) fan it out.
	let w = $state(0);
	let h = $state(0);
	const orientation = $derived(w > 0 && h > 0 && w / h < 1.1 ? 'portrait' : 'landscape');

	const graph = $derived.by(() => buildPowerGraph(caps, power, orientation));

	type Line = { id: string; type: 'DC' | 'AC'; flow: Flow; color: string; dur: number; d: string; pill: Pt };

	/** Segment pts → SVG path: 2 pts line, 3 quadratic, 4 cubic (see power-graph). */
	function toPath(px: Pt[]): string {
		const c = px.map((p) => `${p.x} ${p.y}`);
		if (px.length === 4) return `M ${c[0]} C ${c[1]}, ${c[2]}, ${c[3]}`;
		if (px.length === 3) return `M ${c[0]} Q ${c[1]}, ${c[2]}`;
		return `M ${c[0]} L ${c[1]}`;
	}

	/** Point at t = 0.5 along the segment — anchors the DC/AC pill to the bend. */
	function midpoint(px: Pt[]): Pt {
		const mix = (ws: number[]) => ({
			x: px.reduce((a, p, i) => a + p.x * ws[i], 0),
			y: px.reduce((a, p, i) => a + p.y * ws[i], 0)
		});
		if (px.length === 4) return mix([0.125, 0.375, 0.375, 0.125]);
		if (px.length === 3) return mix([0.25, 0.5, 0.25]);
		return mix([0.5, 0.5]);
	}

	const lines = $derived.by<Line[]>(() => {
		if (w === 0 || h === 0) return [];
		return graph.segments.map((s) => {
			const px = s.pts.map((p) => ({ x: p.x * w, y: p.y * h }));
			return {
				id: s.id,
				type: s.type,
				flow: s.flow,
				color: s.color,
				dur: flowDuration(s.value),
				d: toPath(px),
				pill: midpoint(px)
			};
		});
	});

	/** Map magnitude → dash travel time (s). More watts = faster stream. */
	function flowDuration(watts: number | undefined): number {
		const a = Math.abs(watts ?? 0);
		const ms = 2600 / (1 + a / 130);
		return Math.min(2600, Math.max(420, ms)) / 1000;
	}
</script>

<div class="relative h-full w-full" bind:clientWidth={w} bind:clientHeight={h}>
	<!-- Soft ambience centred on the hub — gives the wall display depth without
	     competing with the flow lines. -->
	<div
		class="pointer-events-none absolute inset-0"
		style={`background:radial-gradient(60% 55% at ${graph.hub.x * 100}% ${graph.hub.y * 100}%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 75%)`}
	></div>

	{#if w > 0 && h > 0}
		<svg class="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
			<!-- Static dotted rails first (all segments) so a later segment's idle rail
			     never overpaints an earlier segment's coloured flow where routes cross. -->
			{#each lines as l (l.id)}
				<path
					class="text-border"
					d={l.d}
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-dasharray="0.1 8"
				/>
			{/each}
			<!-- Travelling energy dots on top. -->
			{#each lines as l (`flow-${l.id}`)}
				{#if l.flow !== 'idle'}
					<path
						class={`flow-line ${l.flow === 'in' ? 'flow-in' : 'flow-out'} ${l.color}`}
						d={l.d}
						fill="none"
						stroke="currentColor"
						stroke-width="4"
						stroke-linecap="round"
						stroke-dasharray="0.1 13.9"
						style={`animation-duration:${l.dur}s`}
					/>
				{/if}
			{/each}
		</svg>

		<!-- Connector-type pills (DC / AC) at each segment's bend. -->
		{#each lines as l (`pill-${l.id}`)}
			<span
				class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-1.5 py-px text-[0.55rem] font-medium uppercase tracking-wide text-muted-foreground"
				style={`left:${l.pill.x}px;top:${l.pill.y}px`}
			>
				{l.type}
			</span>
		{/each}
	{/if}

	<!-- Inverter hub. Only the circle is centred on the anchor; the metric and
	     caption pills float above/below it on translucent backdrops so connector
	     rails can pass underneath without colliding with text. -->
	<div
		class="absolute -translate-x-1/2 -translate-y-1/2"
		style={`left:${graph.hub.x * 100}%;top:${graph.hub.y * 100}%`}
	>
		{#if (efficiency !== undefined && efficiency > 0) || selfUse !== undefined}
			<div
				class="absolute bottom-full left-1/2 mb-2.5 flex -translate-x-1/2 justify-center gap-4 rounded-xl border border-border/60 bg-background/85 px-3 py-1.5 leading-tight backdrop-blur-[2px]"
			>
				{#if efficiency !== undefined && efficiency > 0}
					<div class="flex flex-col items-center whitespace-nowrap">
						<span
							class="flex items-center gap-0.5 text-sm font-semibold tabular-nums text-primary 2xl:text-base"
						>
							<GaugeIcon class="size-3" weight="duotone" />
							<AnimatedNumber value={efficiency} unit="%" />%
						</span>
						<span class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Eff.</span>
					</div>
				{/if}
				{#if selfUse !== undefined}
					<div class="flex flex-col items-center whitespace-nowrap">
						<span class="text-sm font-medium tabular-nums 2xl:text-base">
							<AnimatedNumber value={Math.abs(selfUse)} unit="W" /><span
								class="ml-0.5 text-[0.6rem] font-normal text-muted-foreground">W</span
							>
						</span>
						<span class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Self-use</span>
					</div>
				{/if}
			</div>
		{/if}
		<div
			class="relative flex size-14 items-center justify-center rounded-full border-2 border-primary bg-background sm:size-16 2xl:size-20"
			style="box-shadow:0 0 40px -8px color-mix(in oklab, var(--primary) 55%, transparent)"
		>
			<span class="hub-ring absolute -inset-1 rounded-full border border-primary/50"></span>
			<CpuIcon class="size-7 text-primary sm:size-8 2xl:size-10" weight="duotone" />
		</div>
		<div
			class="absolute left-1/2 top-full mt-2.5 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-background/85 px-2.5 py-1 leading-tight backdrop-blur-[2px]"
		>
			<span
				class={`size-1.5 shrink-0 rounded-full ${inverter.status === 'live' ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
			></span>
			<span class="text-xs font-semibold 2xl:text-sm">Inverter</span>
			<span class="text-[0.62rem] text-muted-foreground 2xl:text-xs">
				{inverter.status === 'live' ? 'Online' : 'Connecting…'}
			</span>
		</div>
	</div>

	{#each graph.nodes as n (n.id)}
		<PowerFlowNode node={n} soc={n.kind === 'battery' ? batterySoc : undefined} />
	{/each}
</div>

<style>
	.flow-line {
		filter: drop-shadow(0 0 5px currentColor);
	}
	.flow-in {
		animation: flow-in linear infinite;
	}
	.flow-out {
		animation: flow-out linear infinite;
	}
	.hub-ring {
		animation: hub-pulse 2.6s ease-in-out infinite;
	}
	/* One dash period (0.1 + 13.9) per keyframe cycle for a seamless loop. */
	@keyframes flow-in {
		to {
			stroke-dashoffset: -14;
		}
	}
	@keyframes flow-out {
		to {
			stroke-dashoffset: 14;
		}
	}
	@keyframes hub-pulse {
		0%,
		100% {
			opacity: 0.35;
			transform: scale(1);
		}
		50% {
			opacity: 0.75;
			transform: scale(1.12);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.flow-in,
		.flow-out,
		.hub-ring {
			animation: none;
		}
	}
</style>
