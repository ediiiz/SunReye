import type { CanonicalRole, InverterCapabilities } from "$lib/inverter/types";
import * as m from "$lib/paraglide/messages";

// Flow relative to the inverter: `in` = power arriving (production / discharge
// / import), `out` = leaving it (load / charge / export).
export type Flow = "in" | "out" | "idle";
/** Anchor as a fraction (0..1) of the diagram box — node anchors are circle centres. */
export type Pt = { x: number; y: number };

/**
 * Diagram shape, picked from the rendered box's aspect ratio: `portrait`
 * stacks sources above the hub and sinks below (phones, narrow panels);
 * `landscape` fans sources in from the left and the grid from the right
 * (tablets, desktops, wall displays).
 */
export type Orientation = "landscape" | "portrait";

/** What the node represents; the component maps this to an icon. */
export type NodeKind = "pv" | "battery" | "load" | "generator" | "grid";

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
  /** Where the caption sits so it never collides with the node's connector. */
  labelSide: "above" | "below";
};

export type GraphSegment = {
  id: string;
  type: "DC" | "AC";
  flow: Flow;
  value: number | undefined;
  color: string;
  /** 2 pts = straight line, 3 = quadratic Bézier, 4 = cubic Bézier; pts[last] is the hub. */
  pts: Pt[];
};

export type PowerGraph = { hub: Pt; nodes: GraphNode[]; segments: GraphSegment[] };

// Anchors are fractions of the *safe box* — the hero minus the component's
// caption insets — so a node centre at y=0/y=1 sits exactly one caption-stack
// away from the hero's edge and text can never clip, however short the box.
const HUBS: Record<Orientation, Pt> = {
  landscape: { x: 0.5, y: 0.44 },
  portrait: { x: 0.5, y: 0.5 },
};

export function sense(
  value: number | undefined,
  positive: { flow: Flow; state: string },
  negative: { flow: Flow; state: string },
): { flow: Flow; state: string } {
  const v = value ?? 0;
  if (v > 0.5) return positive;
  if (v < -0.5) return negative;
  return { flow: "idle", state: m.flow_idle() };
}

// Default flow hue by direction relative to the inverter: arriving = green,
// leaving = amber, idle = the static rail colour.
export function flowColor(flow: Flow): string {
  return flow === "in" ? "text-emerald-500" : flow === "out" ? "text-amber-500" : "text-border";
}

// Grid uses cost semantics instead of raw direction: exporting (feeding energy
// into the grid) is green, importing (pulling from it) is red.
export function gridColor(watts: number | undefined): string {
  const v = watts ?? 0;
  if (v < -0.5) return "text-emerald-500"; // exporting
  if (v > 0.5) return "text-red-500"; // importing
  return "text-border";
}

// SOC → colour: red when low, fading through orange to green when healthy.
// Interpolated between stops so the ring literally fades across the 30/60 bands.
export function socColor(soc: number): string {
  const stops = [
    { p: 0, rgb: [239, 68, 68] }, // red-500
    { p: 30, rgb: [249, 115, 22] }, // orange-500
    { p: 60, rgb: [34, 197, 94] }, // green-500
    { p: 100, rgb: [34, 197, 94] },
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
 * Evenly place `k` anchors along one axis inside [lo, hi], shrinking the span
 * toward the centre when there are few nodes so a pair doesn't hug the edges.
 */
function rowPositions(k: number, lo: number, hi: number): number[] {
  if (k <= 1) return [(lo + hi) / 2];
  const span = ((hi - lo) * (k - 1)) / k;
  const start = (lo + hi) / 2 - span / 2;
  return Array.from({ length: k }, (_, i) => start + (span * i) / (k - 1));
}

/**
 * Route a node above/below the hub: leaves the node along its own column and
 * arrives horizontally into the hub's side (quadratic), or straight when the
 * node sits on the hub's column or row.
 */
function drop(from: Pt, hub: Pt): Pt[] {
  if (from.x === hub.x || from.y === hub.y) return [from, hub];
  return [from, { x: from.x, y: hub.y }, hub];
}

/**
 * Route a node beside the hub (landscape PV strings): a cubic S-curve that
 * leaves and arrives horizontally, or straight when already on the hub's row.
 */
function sweep(from: Pt, hub: Pt): Pt[] {
  if (from.y === hub.y) return [from, hub];
  const mx = (from.x + hub.x) / 2;
  return [from, { x: mx, y: from.y }, { x: mx, y: hub.y }, hub];
}

/**
 * Build the schematic graph for the power-flow diagram from the profile's
 * capabilities and a live power lookup. Pure — the caller injects `power`
 * (role → watts) so this stays free of the inverter store singleton.
 *
 * `has(role, index)` reports whether the driving metric is *visible* — the
 * caller backs it with the filtered `byRole`, so a metric hidden via Settings →
 * Sensors drops its node/segment (a whole group, or a single PV string). It
 * defaults to always-visible so non-UI callers (tests) keep the caps-only
 * shape. Capabilities stay server-derived and never flip on hiding, so presence
 * is `caps` *and* a visible metric.
 */
export function buildPowerGraph(
  caps: InverterCapabilities | null,
  power: (role: CanonicalRole, index?: number) => number | undefined,
  orientation: Orientation = "landscape",
  has: (role: CanonicalRole, index?: number) => boolean = () => true,
): PowerGraph {
  const hub = HUBS[orientation];
  const portrait = orientation === "portrait";
  const nodes: GraphNode[] = [];
  const segments: GraphSegment[] = [];
  const solarAccent = "var(--color-chart-1)";

  // --- Sources: PV strings (or the aggregate) fan into the hub. Portrait puts
  // them in a row along the top (captions above, clear of the connectors);
  // landscape stacks them down the left edge.
  const count = caps?.pvStrings ?? 0;
  // One node per *visible* PV string; hiding a string's power metric drops it.
  // With no per-string capability (or every string hidden), fall back to the
  // aggregate solar node when it's visible, else no PV source at all.
  const strings = Array.from({ length: count }, (_, i) => i + 1)
    .filter((idx) => has("pv.string.power", idx))
    .map((idx) => ({
      id: `pv${idx}`,
      label: `${m.label_string()} ${idx}`,
      value: power("pv.string.power", idx),
    }));
  const pv =
    strings.length > 0
      ? strings
      : has("pv.total.power")
        ? [{ id: "solar", label: m.label_solar(), value: power("pv.total.power") }]
        : [];
  const pvXs = portrait ? rowPositions(pv.length, 0.02, 0.98) : pv.map(() => 0);
  const pvYs = portrait
    ? pv.map(() => 0)
    : pv.length === 1
      ? [hub.y]
      : rowPositions(pv.length, 0.02, 0.78);
  pv.forEach((p, i) => {
    const s = sense(
      p.value,
      { flow: "in", state: m.flow_producing() },
      { flow: "idle", state: m.flow_idle() },
    );
    const at = { x: pvXs[i], y: pvYs[i] };
    nodes.push({
      ...p,
      kind: "pv",
      accent: solarAccent,
      color: flowColor(s.flow),
      at,
      labelSide: portrait ? "above" : "below",
      ...s,
    });
    segments.push({
      id: `${p.id}-hub`,
      type: "DC",
      flow: s.flow,
      value: p.value,
      color: flowColor(s.flow),
      pts: portrait ? drop(at, hub) : sweep(at, hub),
    });
  });

  // --- Sinks/storage row below the hub. The grid joins it in portrait; in
  // landscape the grid gets the right end of the spine instead.
  type BottomSpec = {
    id: string;
    label: string;
    kind: NodeKind;
    type: "DC" | "AC";
    value: number | undefined;
    flow: Flow;
    state: string;
    accent: string;
    color: string;
  };
  const bottoms: BottomSpec[] = [];

  if (caps?.battery && has("battery.power")) {
    const v = power("battery.power");
    // Sign convention (Deye register 590): power > 0 discharging (in), < 0 charging (out).
    const s = sense(
      v,
      { flow: "in", state: m.flow_discharging() },
      { flow: "out", state: m.flow_charging() },
    );
    bottoms.push({
      id: "battery",
      label: m.label_battery(),
      kind: "battery",
      type: "DC",
      value: v,
      accent: "var(--color-chart-3)",
      color: flowColor(s.flow),
      ...s,
    });
  }

  const gridVisible = Boolean(caps?.grid) && has("grid.power");
  const gridValue = gridVisible ? power("grid.power") : undefined;
  const gridSense = sense(
    gridValue,
    { flow: "in", state: m.flow_importing() },
    { flow: "out", state: m.flow_exporting() },
  );
  if (gridVisible && portrait) {
    bottoms.push({
      id: "grid",
      label: m.label_grid(),
      kind: "grid",
      type: "AC",
      value: gridValue,
      accent: "var(--color-chart-4)",
      color: gridColor(gridValue),
      ...gridSense,
    });
  }

  if (caps?.backupLoad && has("load.power")) {
    const v = power("load.power");
    const s = sense(
      v,
      { flow: "out", state: m.flow_consuming() },
      { flow: "out", state: m.flow_consuming() },
    );
    bottoms.push({
      id: "load",
      label: m.label_load(),
      kind: "load",
      type: "AC",
      value: v,
      accent: "var(--color-chart-5)",
      color: flowColor(s.flow),
      ...s,
    });
  }

  if (caps?.generator && has("generator.power")) {
    const v = power("generator.power");
    const s = sense(
      v,
      { flow: "in", state: m.flow_running() },
      { flow: "idle", state: m.flow_off() },
    );
    bottoms.push({
      id: "generator",
      label: m.label_generator(),
      kind: "generator",
      type: "AC",
      value: v,
      accent: "var(--color-chart-2)",
      color: flowColor(s.flow),
      ...s,
    });
  }

  // Portrait spreads the sink row across the full safe box — phones need every
  // pixel of width; the insets already keep the outermost captions legal.
  const bottomXs = portrait
    ? bottoms.map((_, i) => (bottoms.length === 1 ? 0.5 : i / (bottoms.length - 1)))
    : rowPositions(bottoms.length, 0.16, 0.84);
  const bottomY = 1;
  bottoms.forEach((b, i) => {
    const at = { x: bottomXs[i], y: bottomY };
    const { type, ...node } = b;
    nodes.push({ ...node, at, labelSide: "below" });
    segments.push({
      id: `${b.id}-hub`,
      type,
      flow: b.flow,
      value: b.value,
      color: b.color,
      pts: drop(at, hub),
    });
  });

  if (gridVisible && !portrait) {
    const at = { x: 1, y: hub.y };
    nodes.push({
      id: "grid",
      label: m.label_grid(),
      kind: "grid",
      value: gridValue,
      accent: "var(--color-chart-4)",
      color: gridColor(gridValue),
      at,
      labelSide: "below",
      ...gridSense,
    });
    segments.push({
      id: "grid-hub",
      type: "AC",
      flow: gridSense.flow,
      value: gridValue,
      color: gridColor(gridValue),
      pts: [at, hub],
    });
  }

  return { hub, nodes, segments };
}
