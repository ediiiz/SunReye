import type {
  InverterCapabilities,
  InverterFeature,
  InverterManifest,
  InverterProfile,
  ManifestMetric,
  MetricDef,
  MetricKind,
} from "./types";

/**
 * Effective {@link MetricKind}: an explicit `kind` wins, otherwise inferred from
 * access (writable → setting) and unit (kWh → cumulative), defaulting to a
 * plain measurement. Keeps profiles from having to annotate every metric.
 */
export function resolveKind(def: MetricDef): MetricKind {
  if (def.kind) return def.kind;
  if (def.access === "rw") return "setting";
  if (def.unit === "kWh") return "cumulative";
  return "measurement";
}

/** Count distinct 1-based indices for an indexed role (e.g. PV strings). */
function countIndices(metrics: MetricDef[], role: string): number {
  const seen = new Set<number>();
  for (const m of metrics) {
    if (m.role === role && m.index !== undefined) seen.add(m.index);
  }
  return seen.size;
}

const hasRole = (metrics: MetricDef[], prefix: string): boolean =>
  metrics.some((m) => m.role?.startsWith(prefix));

/**
 * Derive what the inverter can do from the roles/groups present in its profile.
 * Presence of a canonical role is the signal — no per-inverter probing in the UI.
 */
export function deriveCapabilities(profile: InverterProfile): InverterCapabilities {
  const metrics = profile.metrics;

  const features: InverterFeature[] = [];
  if (metrics.some((m) => m.role === "setting.solar_sell.enabled")) features.push("solar_sell");
  if (metrics.some((m) => m.role === "setting.battery.grid_charge")) features.push("grid_charge");
  if (metrics.some((m) => m.group === "timeofuse")) features.push("time_of_use");

  return {
    battery: hasRole(metrics, "battery."),
    pvStrings: countIndices(metrics, "pv.string.power"),
    phases: Math.max(1, countIndices(metrics, "grid.phase.voltage")),
    grid: hasRole(metrics, "grid."),
    generator: hasRole(metrics, "generator."),
    backupLoad: hasRole(metrics, "load."),
    features,
    controls: metrics.filter((m) => m.access === "rw").map((m) => m.key),
  };
}

/** Serialize a metric to its render-ready form (drops functions/addresses). */
export function toManifestMetric(def: MetricDef): ManifestMetric {
  return {
    key: def.key,
    topic: def.topic,
    label: def.label,
    unit: def.unit,
    group: def.group,
    kind: resolveKind(def),
    writable: def.access === "rw",
    role: def.role,
    index: def.index,
    range: def.range,
    enumLabels: def.enumLabels,
    flow: def.flow,
  };
}

/** Build the full client contract: identity + capabilities + metric catalog. */
export function buildManifest(profile: InverterProfile): InverterManifest {
  return {
    id: profile.id,
    name: profile.name,
    manufacturer: profile.manufacturer,
    capabilities: deriveCapabilities(profile),
    metrics: profile.metrics.map(toManifestMetric),
  };
}
