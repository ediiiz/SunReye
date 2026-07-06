import type { CanonicalRole } from "./roles";
import type {
  InverterProfile,
  MetricAccess,
  MetricDef,
  MetricFlow,
  MetricKind,
  MetricRange,
  MetricValues,
  RegisterType,
  SimulateFn,
} from "./types";

/**
 * Serializable inverter profile — the downloadable artifact and DB row. It is a
 * pure-data mirror of {@link InverterProfile}: the `compute` closure becomes a
 * declarative {@link ComputeExpr}, and there is no `simulate` hook (data
 * profiles fall back to generic synthesis). {@link hydrateProfile} turns it back
 * into the runtime {@link InverterProfile} the engine consumes, so nothing
 * downstream of the registry has to know a profile came from data vs. code.
 */
export interface ProfileData {
  /** Bumped when the serialized shape changes; validated on load. */
  schemaVersion: 1;
  id: string;
  name: string;
  manufacturer: string;
  /** Semver of the profile content itself (drives update detection). */
  version: string;
  metrics: MetricDataDef[];
}

/**
 * Declarative replacement for a `compute` closure. A small, closed set — never
 * arbitrary code — so a downloaded profile can never execute. Referenced keys
 * are resolved from the sample at compute time; a missing key reads as 0.
 *
 * - `sum`     add the listed metric keys.
 * - `diff`    first minus second.
 * - `scale`   a metric key times a constant.
 * - `combine` sum of `add` keys minus sum of `sub` keys (a signed linear mix).
 * - `ratio`   (sum of `num` / sum of `den`) times `scale` (default 1); a zero
 *             denominator reads as 0 so night/idle samples never divide by zero.
 */
export type ComputeExpr =
  | { sum: string[] }
  | { diff: [string, string] }
  | { scale: [string, number] }
  | { combine: { add: string[]; sub?: string[] } }
  | { ratio: { num: string[]; den: string[]; scale?: number } };

/** {@link MetricDef} without runtime-only fields: `compute` → `computeExpr`. */
export interface MetricDataDef {
  key: string;
  topic: string;
  label: string;
  unit: string | null;
  group: string;
  type: RegisterType;
  addresses: number[];
  scale: number;
  access: MetricAccess;
  /** Declarative derived value; mutually exclusive with reading from the wire. */
  computeExpr?: ComputeExpr;
  role?: CanonicalRole;
  index?: number;
  kind?: MetricKind;
  range?: MetricRange;
  enumLabels?: Record<number, string>;
  flow?: MetricFlow;
}

/** Compile a {@link ComputeExpr} into the `compute` closure the engine runs. */
export function compileComputeExpr(expr: ComputeExpr): (values: MetricValues) => number {
  if ("sum" in expr) {
    const keys = expr.sum;
    return (v) => keys.reduce((acc, k) => acc + (v[k] ?? 0), 0);
  }
  if ("diff" in expr) {
    const [a, b] = expr.diff;
    return (v) => (v[a] ?? 0) - (v[b] ?? 0);
  }
  if ("scale" in expr) {
    const [key, factor] = expr.scale;
    return (v) => (v[key] ?? 0) * factor;
  }
  const sumOf = (keys: string[], v: MetricValues) => keys.reduce((acc, k) => acc + (v[k] ?? 0), 0);
  if ("combine" in expr) {
    const { add, sub = [] } = expr.combine;
    return (v) => sumOf(add, v) - sumOf(sub, v);
  }
  const { num, den, scale = 1 } = expr.ratio;
  return (v) => {
    const d = sumOf(den, v);
    return d === 0 ? 0 : (sumOf(num, v) / d) * scale;
  };
}

function toMetricDef(m: MetricDataDef): MetricDef {
  const { computeExpr, ...rest } = m;
  return computeExpr ? { ...rest, compute: compileComputeExpr(computeExpr) } : rest;
}

/**
 * Turn serializable {@link ProfileData} into the runtime {@link InverterProfile}.
 * First-party packages may pass a code {@link SimulateFn} (data profiles omit it
 * and fall back to the simulator's generic synthesis).
 */
export function hydrateProfile(
  data: ProfileData,
  opts?: { simulate?: SimulateFn },
): InverterProfile {
  return {
    id: data.id,
    name: data.name,
    manufacturer: data.manufacturer,
    metrics: data.metrics.map(toMetricDef),
    simulate: opts?.simulate,
  };
}
