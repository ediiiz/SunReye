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

	// Flow relative to the inverter: `in` = power arriving (production / discharge
	// / import), `out` = leaving it (load / charge / export).
	type Flow = 'in' | 'out' | 'idle';
	/** Anchor as a fraction (0..1) of the diagram box — node anchors are circle centres. */
	type Pt = { x: number; y: number };

	type Node = {
		id: string;
		label: string;
		icon: Component;
		value: number | undefined;
		flow: Flow;
		state: string;
		accent: string;
		/** Tailwind text-* class for the flow hue (defaults to {@link flowColor}). */
		color: string;
		at: Pt;
	};

	type Segment = {
		id: string;
		type: 'DC' | 'AC';
		flow: Flow;
		value: number | undefined;
		color: string;
		/** Right-angle route; dashes travel pts[0]→…→pts[last]. pts[last] is the hub. */
		pts: Pt[];
	};

	// Fixed schematic anchors — a left→right single-line: strings ▸ inverter ▸ grid,
	// with battery / load / generator dropping off the spine. Edge anchors are held
	// off the box edges so the node labels (w-24) never clip.
	const HUB: Pt = { x: 0.3, y: 0.26 };
	const GRID: Pt = { x: 0.9, y: 0.26 };
	const BATTERY: Pt = { x: 0.3, y: 0.74 };
	const LOAD: Pt = { x: 0.57, y: 0.74 };
	const GEN: Pt = { x: 0.75, y: 0.74 };

	function power(role: CanonicalRole, index?: number): number | undefined {
		const m = inverter.byRole(role, index);
		return m ? inverter.value(m.key) : undefined;
	}

	function sense(
		value: number | undefined,
		positive: { flow: Flow; state: string },
		negative: { flow: Flow; state: string }
	): { flow: Flow; state: string } {
		const v = value ?? 0;
		if (v > 0.5) return positive;
		if (v < -0.5) return negative;
		return { flow: 'idle', state: 'Idle' };
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

	// SOC ring geometry: drawn inside the 56px node circle (viewBox 56×56) so the
	// battery keeps the same footprint as every other node.
	const SOC_R = 26;
	const SOC_C = 2 * Math.PI * SOC_R;

	// SOC → colour: red when low, fading through orange to green when healthy.
	// Interpolated between stops so the ring literally fades across the 30/60 bands.
	function socColor(soc: number): string {
		const stops = [
			{ p: 0, rgb: [239, 68, 68] }, // red-500
			{ p: 30, rgb: [249, 115, 22] }, // orange-500
			{ p: 60, rgb: [34, 197, 94] }, // green-500
			{ p: 100, rgb: [34, 197, 94] }
		];
		const s = Math.min(100, Math.max(0, soc));
		let lo = stops[0];
		let hi = stops[stops.length - 1];
		for (let i = 0; i < stops.length - 1; i++) {
			if (s >= stops[i].p && s <= stops[i + 1].p) {
				lo = stops[i];
				hi = stops[i + 1];
				break;
			}
		}
		const t = hi.p === lo.p ? 0 : (s - lo.p) / (hi.p - lo.p);
		const c = lo.rgb.map((v, i) => Math.round(v + (hi.rgb[i] - v) * t));
		return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
	}

	const graph = $derived.by(() => {
		const nodes: Node[] = [];
		const segments: Segment[] = [];
		const solarAccent = 'var(--color-chart-1)';

		// PV strings on the left. Each runs horizontally at its own height, then a
		// short elbow near the inverter into a distinct entry point on the hub's
		// left side — separate right-angle runs that never share a rail.
		const count = caps?.pvStrings ?? 0;
		if (count > 0) {
			const lo = 0.1;
			const hi = 0.46;
			for (let i = 1; i <= count; i++) {
				const y = count === 1 ? HUB.y : lo + ((hi - lo) * (i - 1)) / (count - 1);
				const v = power('pv.string.power', i);
				const s = sense(v, { flow: 'in', state: 'Producing' }, { flow: 'idle', state: 'Idle' });
				const at = { x: 0.08, y };
				nodes.push({ id: `pv${i}`, label: `String ${i}`, icon: Sun, value: v, accent: solarAccent, color: flowColor(s.flow), at, ...s });
				// Shared riser column (aligned elbows); entry height staggered so the
				// short stubs into the hub stay separate.
				const bx = HUB.x - 0.05;
				const entryY = count === 1 ? HUB.y : HUB.y + (i - (count + 1) / 2) * 0.03;
				const pts =
					count === 1 ? [at, HUB] : [at, { x: bx, y }, { x: bx, y: entryY }, { x: HUB.x, y: entryY }];
				segments.push({ id: `pv${i}-hub`, type: 'DC', flow: s.flow, value: v, color: flowColor(s.flow), pts });
			}
		} else {
			const v = power('pv.total.power');
			const s = sense(v, { flow: 'in', state: 'Producing' }, { flow: 'idle', state: 'Idle' });
			const at = { x: 0.08, y: HUB.y };
			nodes.push({ id: 'solar', label: 'Solar', icon: Sun, value: v, accent: solarAccent, color: flowColor(s.flow), ...s, at });
			segments.push({ id: 'solar-hub', type: 'DC', flow: s.flow, value: v, color: flowColor(s.flow), pts: [at, HUB] });
		}

		if (caps?.battery) {
			const v = power('battery.power');
			// Sign convention: power > 0 charging (out), < 0 discharging (in).
			const s = sense(v, { flow: 'out', state: 'Charging' }, { flow: 'in', state: 'Discharging' });
			nodes.push({ id: 'battery', label: 'Battery', icon: BatteryChargingIcon, value: v, accent: 'var(--color-chart-3)', color: flowColor(s.flow), at: BATTERY, ...s });
			segments.push({ id: 'battery-hub', type: 'DC', flow: s.flow, value: v, color: flowColor(s.flow), pts: [BATTERY, HUB] });
		}

		if (caps?.backupLoad) {
			const v = power('load.power');
			const s = sense(v, { flow: 'out', state: 'Consuming' }, { flow: 'out', state: 'Consuming' });
			nodes.push({ id: 'load', label: 'Load', icon: House, value: v, accent: 'var(--color-chart-5)', color: flowColor(s.flow), at: LOAD, ...s });
			// Backup load is a dedicated AC output — route it into the hub from below
			// on its own rail rather than merging onto the grid spine (y = HUB.y).
			segments.push({
				id: 'load-hub',
				type: 'AC',
				flow: s.flow,
				value: v,
				color: flowColor(s.flow),
				pts: [LOAD, { x: LOAD.x, y: 0.5 }, { x: 0.4, y: 0.5 }, HUB]
			});
		}

		if (caps?.generator) {
			const v = power('generator.power');
			const s = sense(v, { flow: 'in', state: 'Running' }, { flow: 'idle', state: 'Off' });
			nodes.push({ id: 'generator', label: 'Generator', icon: Engine, value: v, accent: 'var(--color-chart-2)', color: flowColor(s.flow), at: GEN, ...s });
			segments.push({ id: 'gen-hub', type: 'AC', flow: s.flow, value: v, color: flowColor(s.flow), pts: [GEN, { x: GEN.x, y: HUB.y }, HUB] });
		}

		if (caps?.grid) {
			const v = power('grid.power');
			const s = sense(v, { flow: 'in', state: 'Importing' }, { flow: 'out', state: 'Exporting' });
			nodes.push({ id: 'grid', label: 'Grid', icon: Lightning, value: v, accent: 'var(--color-chart-4)', color: gridColor(v), at: GRID, ...s });
			segments.push({ id: 'grid-hub', type: 'AC', flow: s.flow, value: v, color: gridColor(v), pts: [GRID, HUB] });
		}

		return { nodes, segments };
	});

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

	// Default flow hue by direction relative to the inverter: arriving = green,
	// leaving = amber, idle = the static rail colour.
	function flowColor(flow: Flow): string {
		return flow === 'in' ? 'text-emerald-500' : flow === 'out' ? 'text-amber-500' : 'text-border';
	}

	// Grid uses cost semantics instead of raw direction: exporting (feeding energy
	// into the grid) is green, importing (pulling from it) is red.
	function gridColor(watts: number | undefined): string {
		const v = watts ?? 0;
		if (v < -0.5) return 'text-emerald-500'; // exporting
		if (v > 0.5) return 'text-red-500'; // importing
		return 'text-border';
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
				<span class="text-xs font-semibold">Inverter</span>
				<span class="text-[0.62rem] text-muted-foreground">
					{inverter.status === 'live' ? 'Online' : 'Connecting…'}
				</span>
			</div>
		</div>

		{#each graph.nodes as n (n.id)}
			{@const Icon = n.icon}
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
