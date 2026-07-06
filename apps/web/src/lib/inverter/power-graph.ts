import type { CanonicalRole, InverterCapabilities } from '$lib/inverter/types';

// Flow relative to the inverter: `in` = power arriving (production / discharge
// / import), `out` = leaving it (load / charge / export).
export type Flow = 'in' | 'out' | 'idle';
/** Anchor as a fraction (0..1) of the diagram box — node anchors are circle centres. */
export type Pt = { x: number; y: number };

/** What the node represents; the component maps this to an icon. */
export type NodeKind = 'pv' | 'battery' | 'load' | 'generator' | 'grid';

export type GraphNode = {
	id: string;
	label: string;
	kind: NodeKind;
	value: number | undefined;
	flow: Flow;
	state: string;
	accent: string;
	/** Tailwind text-* class for the flow hue (defaults to {@link flowColor}). */
	color: string;
	at: Pt;
};

export type GraphSegment = {
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
export const HUB: Pt = { x: 0.3, y: 0.26 };
const GRID: Pt = { x: 0.9, y: 0.26 };
const BATTERY: Pt = { x: 0.3, y: 0.74 };
const LOAD: Pt = { x: 0.57, y: 0.74 };
const GEN: Pt = { x: 0.75, y: 0.74 };

export function sense(
	value: number | undefined,
	positive: { flow: Flow; state: string },
	negative: { flow: Flow; state: string }
): { flow: Flow; state: string } {
	const v = value ?? 0;
	if (v > 0.5) return positive;
	if (v < -0.5) return negative;
	return { flow: 'idle', state: 'Idle' };
}

// Default flow hue by direction relative to the inverter: arriving = green,
// leaving = amber, idle = the static rail colour.
export function flowColor(flow: Flow): string {
	return flow === 'in' ? 'text-emerald-500' : flow === 'out' ? 'text-amber-500' : 'text-border';
}

// Grid uses cost semantics instead of raw direction: exporting (feeding energy
// into the grid) is green, importing (pulling from it) is red.
export function gridColor(watts: number | undefined): string {
	const v = watts ?? 0;
	if (v < -0.5) return 'text-emerald-500'; // exporting
	if (v > 0.5) return 'text-red-500'; // importing
	return 'text-border';
}

// SOC → colour: red when low, fading through orange to green when healthy.
// Interpolated between stops so the ring literally fades across the 30/60 bands.
export function socColor(soc: number): string {
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

/**
 * Build the schematic graph for the power-flow diagram from the profile's
 * capabilities and a live power lookup. Pure — the caller injects `power`
 * (role → watts) so this stays free of the inverter store singleton.
 */
export function buildPowerGraph(
	caps: InverterCapabilities | null,
	power: (role: CanonicalRole, index?: number) => number | undefined
): { nodes: GraphNode[]; segments: GraphSegment[] } {
	const nodes: GraphNode[] = [];
	const segments: GraphSegment[] = [];
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
			nodes.push({ id: `pv${i}`, label: `String ${i}`, kind: 'pv', value: v, accent: solarAccent, color: flowColor(s.flow), at, ...s });
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
		nodes.push({ id: 'solar', label: 'Solar', kind: 'pv', value: v, accent: solarAccent, color: flowColor(s.flow), ...s, at });
		segments.push({ id: 'solar-hub', type: 'DC', flow: s.flow, value: v, color: flowColor(s.flow), pts: [at, HUB] });
	}

	if (caps?.battery) {
		const v = power('battery.power');
		// Sign convention: power > 0 charging (out), < 0 discharging (in).
		const s = sense(v, { flow: 'out', state: 'Charging' }, { flow: 'in', state: 'Discharging' });
		nodes.push({ id: 'battery', label: 'Battery', kind: 'battery', value: v, accent: 'var(--color-chart-3)', color: flowColor(s.flow), at: BATTERY, ...s });
		segments.push({ id: 'battery-hub', type: 'DC', flow: s.flow, value: v, color: flowColor(s.flow), pts: [BATTERY, HUB] });
	}

	if (caps?.backupLoad) {
		const v = power('load.power');
		const s = sense(v, { flow: 'out', state: 'Consuming' }, { flow: 'out', state: 'Consuming' });
		nodes.push({ id: 'load', label: 'Load', kind: 'load', value: v, accent: 'var(--color-chart-5)', color: flowColor(s.flow), at: LOAD, ...s });
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
		nodes.push({ id: 'generator', label: 'Generator', kind: 'generator', value: v, accent: 'var(--color-chart-2)', color: flowColor(s.flow), at: GEN, ...s });
		segments.push({ id: 'gen-hub', type: 'AC', flow: s.flow, value: v, color: flowColor(s.flow), pts: [GEN, { x: GEN.x, y: HUB.y }, HUB] });
	}

	if (caps?.grid) {
		const v = power('grid.power');
		const s = sense(v, { flow: 'in', state: 'Importing' }, { flow: 'out', state: 'Exporting' });
		nodes.push({ id: 'grid', label: 'Grid', kind: 'grid', value: v, accent: 'var(--color-chart-4)', color: gridColor(v), at: GRID, ...s });
		segments.push({ id: 'grid-hub', type: 'AC', flow: s.flow, value: v, color: gridColor(v), pts: [GRID, HUB] });
	}

	return { nodes, segments };
}
