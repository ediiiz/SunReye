<script lang="ts">
	import type { Component } from 'svelte';
	import Sun from 'phosphor-svelte/lib/Sun';
	import BatteryChargingIcon from 'phosphor-svelte/lib/BatteryCharging';
	import Lightning from 'phosphor-svelte/lib/Lightning';
	import House from 'phosphor-svelte/lib/House';
	import Engine from 'phosphor-svelte/lib/Engine';
	import CpuIcon from 'phosphor-svelte/lib/Cpu';
	import GaugeIcon from 'phosphor-svelte/lib/Gauge';
	import ArrowDown from 'phosphor-svelte/lib/ArrowDown';
	import ArrowUp from 'phosphor-svelte/lib/ArrowUp';
	import type { CanonicalRole } from '$lib/inverter/types';
	import AnimatedNumber from './animated-number.svelte';
	import { inverter } from '$lib/inverter/store.svelte';
	import * as msg from '$lib/paraglide/messages';
	import {
		HUB,
		buildPowerGraph,
		socColor,
		type Flow,
		type NodeKind,
		type Pt
	} from '$lib/inverter/power-graph';

	function power(role: CanonicalRole, index?: number): number | undefined {
		const m = inverter.byRole(role, index);
		return m ? inverter.value(m.key) : undefined;
	}

	// Node kind → icon; the graph builder stays a pure module without component
	// imports so it can run under bun test.
	const ICONS: Record<NodeKind, Component> = {
		pv: Sun,
		battery: BatteryChargingIcon,
		load: House,
		generator: Engine,
		grid: Lightning
	};

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

	// SOC ring geometry: drawn inside the 56px node circle (viewBox 56×56) so the
	// battery keeps the same footprint as every other node.
	const SOC_R = 26;
	const SOC_C = 2 * Math.PI * SOC_R;

	const graph = $derived.by(() => buildPowerGraph(caps, power));

	// Connector dashes must render in real pixels, so bind the rendered size and
	// project the fractional anchors into it.
	let w = $state(0);
	let h = $state(0);

	type Line = { id: string; type: 'DC' | 'AC'; flow: Flow; color: string; dur: number; points: string; pill: Pt };

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
				points: px.map((p) => `${p.x},${p.y}`).join(' '),
				// Pill sits on the first leg (near the source node).
				pill: { x: (px[0].x + px[1].x) / 2, y: (px[0].y + px[1].y) / 2 }
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

<div class="overflow-x-auto">
	<div class="relative h-100 w-full min-w-200" bind:clientWidth={w} bind:clientHeight={h}>
		{#if w > 0}
			<svg class="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
				<!-- Static rails first (all segments) so a later segment's idle rail never
				     overpaints an earlier segment's coloured flow where routes share a leg. -->
				{#each lines as l (l.id)}
					<polyline class="text-border" points={l.points} fill="none" stroke="currentColor" stroke-width="1.5" />
				{/each}
				<!-- Active flow lines on top. -->
				{#each lines as l (`flow-${l.id}`)}
					{#if l.flow !== 'idle'}
						<polyline
							class={`flow-line ${l.flow === 'in' ? 'flow-in' : 'flow-out'} ${l.color}`}
							points={l.points}
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linejoin="round"
							stroke-dasharray="5 11"
							style={`animation-duration:${l.dur}s`}
						/>
					{/if}
				{/each}
			</svg>

			<!-- Connector-type pills (DC / AC) on the first leg of each segment. -->
			{#each lines as l (`pill-${l.id}`)}
				<span
					class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground"
					style={`left:${l.pill.x}px;top:${l.pill.y}px`}
				>
					{l.type}
				</span>
			{/each}
		{/if}

		<!-- Inverter hub. Only the circle is centred on the anchor; the caption floats
		     below it so the connecting rails meet the circle, not the text. -->
		<div class="absolute -translate-x-1/2 -translate-y-1/2" style={`left:${HUB.x * 100}%;top:${HUB.y * 100}%`}>
			{#if (efficiency !== undefined && efficiency > 0) || selfUse !== undefined}
				<div
					class="absolute bottom-full left-1/2 mb-2 flex w-32 -translate-x-1/2 justify-center gap-4 leading-tight"
				>
					{#if efficiency !== undefined && efficiency > 0}
						<div class="flex flex-col items-center whitespace-nowrap">
							<span class="flex items-center gap-0.5 text-sm font-semibold tabular-nums text-primary">
								<GaugeIcon class="size-3" weight="duotone" />
								<AnimatedNumber value={efficiency} unit="%" />%
							</span>
							<span class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Eff.</span>
						</div>
					{/if}
					{#if selfUse !== undefined}
						<div class="flex flex-col items-center whitespace-nowrap">
							<span class="text-sm font-medium tabular-nums">
								<AnimatedNumber value={Math.abs(selfUse)} unit="W" /><span
									class="ml-0.5 text-[0.6rem] font-normal text-muted-foreground">W</span
								>
							</span>
							<span class="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Self-use</span>
						</div>
					{/if}
				</div>
			{/if}
			<div class="relative flex size-14 items-center justify-center rounded-full border-2 border-primary bg-background">
				<span class="hub-ring absolute -inset-1 rounded-full border border-primary/50"></span>
				<CpuIcon class="size-7 text-primary" weight="duotone" />
			</div>
			<div class="absolute left-1/2 top-full mt-2 flex w-32 -translate-x-1/2 flex-col items-center leading-tight">
				<span class="text-xs font-semibold">{msg.label_inverter()}</span>
				<span class="text-[0.62rem] text-muted-foreground">
					{inverter.status === 'live' ? 'Online' : 'Connecting…'}
				</span>
			</div>
		</div>

		{#each graph.nodes as n (n.id)}
			{@const Icon = ICONS[n.kind]}
			{@const active = n.flow !== 'idle'}
			{@const isBattery = n.id === 'battery' && batterySoc !== undefined}
			<div
				class="absolute -translate-x-1/2 -translate-y-1/2"
				style={`left:${n.at.x * 100}%;top:${n.at.y * 100}%`}
				class:opacity-70={!active}
			>
				<div class="relative size-14">
					<div
						class="flex size-full items-center justify-center rounded-full border-2 bg-background"
						style={`border-color:${isBattery ? 'transparent' : active ? n.accent : 'var(--border)'}`}
					>
						<Icon class="size-7" weight="duotone" style={`color:${active ? n.accent : 'var(--muted-foreground)'}`} />
					</div>
					{#if isBattery && batterySoc !== undefined}
						<!-- Circular SOC gauge inset to the circle edge so the battery keeps the
						     same footprint as the other nodes. -->
						<svg class="absolute inset-0 size-full -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
							<circle class="text-border" cx="28" cy="28" r={SOC_R} fill="none" stroke="currentColor" stroke-width="2.5" />
							<circle
								cx="28"
								cy="28"
								r={SOC_R}
								fill="none"
								stroke={socColor(batterySoc)}
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-dasharray={SOC_C}
								stroke-dashoffset={SOC_C * (1 - batterySoc / 100)}
								style="transition:stroke-dashoffset 500ms linear, stroke 500ms linear"
							/>
						</svg>
						<span
							class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-border bg-background px-1.5 text-[0.62rem] font-semibold tabular-nums leading-tight"
							style={`color:${socColor(batterySoc)}`}
						>
							{Math.round(batterySoc)}%
						</span>
					{/if}
				</div>
				<div class="absolute left-1/2 top-full mt-2 flex w-24 -translate-x-1/2 flex-col items-center gap-0.5 leading-tight">
					<span class="text-xs font-semibold">{n.label}</span>
					<span class="flex items-center gap-0.5 text-sm font-medium tabular-nums">
						{#if n.value === undefined}
							—
						{:else}
							<AnimatedNumber value={Math.abs(n.value)} unit="W" />
						{/if}
						<span class="text-[0.6rem] text-muted-foreground">W</span>
					</span>
					<span class={`flex items-center gap-0.5 text-[0.6rem] uppercase tracking-wide ${n.color}`}>
						{#if n.flow === 'in'}
							<ArrowDown class="size-2.5" />
						{:else if n.flow === 'out'}
							<ArrowUp class="size-2.5" />
						{/if}
						{n.state}
					</span>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.flow-line {
		stroke-linecap: round;
		filter: drop-shadow(0 0 4px currentColor);
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
	@keyframes flow-in {
		to {
			stroke-dashoffset: -16;
		}
	}
	@keyframes flow-out {
		to {
			stroke-dashoffset: 16;
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
