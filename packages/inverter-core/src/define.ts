import type { CanonicalRole } from "./roles";
import { ROLE_CATALOG } from "./roles";
import type {
  ComputeExpr,
  ControlExpr,
  MetricDataDef,
  ProfileData,
  TopicToKey,
} from "./profile-data";
import type { MetricAccess, MetricFlow, MetricKind, MetricRange, RegisterType } from "./types";

/**
 * Authoring SDK for inverter profiles. `metric()` mirrors the terse register-map
 * shape (key derived from the topic, sensible defaults) but is *role-aware*:
 * once you pick a {@link CanonicalRole}, the type system demands the companions
 * that role requires (a 1-based `index` for indexed roles, `enumLabels` for
 * enum/status roles, `access: "rw"` for writable settings). Mapping the wrong
 * shape fails to compile rather than producing a silently broken manifest.
 */

/** Fields every metric shares, independent of role. */
interface BaseMetricOpts {
  label: string;
  group: string;
  /** Single address, `[low, high]` for `U_DWORD`, N words for `RAW`. Omit for computed. */
  addr?: number | number[];
  type?: RegisterType;
  unit?: string | null;
  scale?: number;
  /** Post-scale additive offset (`raw * scale + offset`), e.g. `-100` for +1000-encoded temps. */
  offset?: number;
  access?: MetricAccess;
  /** Declarative derived value (replaces a code `compute`). */
  computeExpr?: ComputeExpr;
  kind?: MetricKind;
  range?: MetricRange;
  flow?: MetricFlow;
}

type RoleEntry<R extends CanonicalRole> = (typeof ROLE_CATALOG)[R];

/** Companions a role forces, read from its {@link ROLE_CATALOG} shape flags. */
type RoleRequirements<R extends CanonicalRole> = (RoleEntry<R> extends { indexed: true }
  ? { index: number }
  : { index?: number }) &
  (RoleEntry<R> extends { needsEnumLabels: true }
    ? { enumLabels: Record<number, string> }
    : { enumLabels?: Record<number, string> }) &
  (RoleEntry<R> extends { writable: true } ? { access: "rw" } : object);

/** Options when a role is supplied: base + the role + its required companions. */
type RoledMetricOpts = {
  [R in CanonicalRole]: BaseMetricOpts & { role: R } & RoleRequirements<R>;
}[CanonicalRole];

/** Options for a plain, unmapped metric — valid, just not rendered by role. */
type UnroledMetricOpts = BaseMetricOpts & {
  role?: undefined;
  index?: number;
  enumLabels?: Record<number, string>;
};

export type MetricOpts = RoledMetricOpts | UnroledMetricOpts;

/**
 * Build one metric. The canonical `key` is the topic with `/` → `.`. Generic on
 * the topic literal so the returned `key` is a literal type ({@link TopicToKey}):
 * profiles can derive their key union (`typeof metrics[number]["key"]`) and feed
 * it to {@link control} for autocompleted, compile-checked control targets.
 */
export function metric<const T extends string>(
  topic: T,
  opts: MetricOpts,
): MetricDataDef & { key: TopicToKey<T> } {
  const { addr } = opts;
  return {
    // The runtime `replaceAll` produces exactly `TopicToKey<T>` by construction;
    // assert it so the literal key type survives (String#replaceAll widens to string).
    key: topic.replaceAll("/", ".") as TopicToKey<T>,
    topic,
    label: opts.label,
    unit: opts.unit ?? null,
    group: opts.group,
    type: opts.type ?? "U_WORD",
    addresses: addr === undefined ? [] : Array.isArray(addr) ? addr : [addr],
    scale: opts.scale ?? 1,
    offset: opts.offset,
    access: opts.access ?? "r",
    computeExpr: opts.computeExpr,
    role: opts.role,
    index: opts.index,
    kind: opts.kind,
    range: opts.range,
    enumLabels: opts.enumLabels,
    flow: opts.flow,
  };
}

/** Options for a composite control built by {@link control}. */
interface ControlOpts<K extends string> {
  label: string;
  group: string;
  /** The declarative action; every `target` is constrained to a profile key `K`. */
  controlExpr: ControlExpr<K>;
  /** Labels for the control's own value (e.g. `{0:"Unlocked",1:"Locked"}`). */
  enumLabels?: Record<number, string>;
  unit?: string | null;
  kind?: MetricKind;
  /** Optional bounds; renders a capped slider and clamps writes when present. */
  range?: MetricRange;
  /** Writable by definition; defaults to `"rw"`. */
  access?: MetricAccess;
}

/**
 * Build a composite control — a writable metric with no register of its own,
 * realized by a {@link ControlExpr} over other metrics. `K` is the profile's
 * canonical key union, so `controlExpr.target` autocompletes and rejects
 * unknown keys at author time. Addressless: never read/written on the wire.
 */
export function control<const K extends string>(
  topic: string,
  opts: ControlOpts<K>,
): MetricDataDef {
  return {
    key: topic.replaceAll("/", "."),
    topic,
    label: opts.label,
    unit: opts.unit ?? null,
    group: opts.group,
    type: "U_WORD",
    addresses: [],
    scale: 1,
    access: opts.access ?? "rw",
    controlExpr: opts.controlExpr,
    enumLabels: opts.enumLabels,
    kind: opts.kind,
    range: opts.range,
  };
}

/** Assemble a {@link ProfileData} from identity + a metric list. */
export function defineProfile(input: {
  id: string;
  name: string;
  manufacturer: string;
  version: string;
  metrics: MetricDataDef[];
}): ProfileData {
  return { schemaVersion: 1, ...input };
}

/**
 * Patch for one existing metric: any `metric()` field (`addr`, `scale`, `type`,
 * `unit`, `label`, `enumLabels`, …) plus a `min`/`max` shorthand that merges into
 * the metric's `range`. `role`/`index` can be restated but rarely need changing.
 */
export type MetricPatch = Partial<Omit<MetricOpts, "role">> & {
  min?: number;
  max?: number;
  role?: CanonicalRole;
  index?: number;
};

/** A brand-new metric added by an overlay: the same opts `metric(key, opts)` takes. */
export type MetricAdd = MetricOpts;

/**
 * Per-model metric overlay keyed by canonical metric key. One rule per entry:
 * - key exists in base + patch object → merge the given fields into that metric
 * - key exists in base + `null`       → remove that metric
 * - trailing `.*` wildcard + `null`   → remove every metric under the prefix
 * - key NOT in base + full definition → add a new metric (topic = key, `.`→`/`)
 *
 * Co-located in {@link defineFamily}, `K` is the base's key union so known keys
 * **autocomplete**. Because wildcards and new-metric adds are also arbitrary
 * strings, a mistyped patch/remove target can't be distinguished from an add at
 * the type level — it's caught at build/load time by the runtime guards below
 * (patch/remove of an absent key throws), not by the compiler.
 */
export type MetricsOverlay<K extends string = string> = Partial<
  Record<K | (string & {}), MetricPatch | MetricAdd | null>
>;

/**
 * Per-model tweaks. Identity (`id`) comes from the `models` record key;
 * `name`/`version`/`manufacturer` inherit from the base when omitted.
 */
export interface ModelOverrides<K extends string = string> {
  name?: string;
  version?: string;
  manufacturer?: string;
  metrics?: MetricsOverlay<K>;
}

function normalizeAddr(addr: number | number[]): number[] {
  return Array.isArray(addr) ? [...addr] : [addr];
}

/** Merge one {@link MetricPatch} into a clone of `base` (never mutates `base`). */
function applyPatch(base: MetricDataDef, patch: MetricPatch): MetricDataDef {
  const { addr, min, max, range, ...rest } = patch;
  const next: MetricDataDef = { ...base, ...rest };
  if (addr !== undefined) next.addresses = normalizeAddr(addr);
  if (range !== undefined) next.range = { ...range };
  if (min !== undefined || max !== undefined) {
    const cur = next.range ?? { min: 0, max: 0 };
    next.range = { min: min ?? cur.min, max: max ?? cur.max };
  }
  return next;
}

/** Keys a `null` overlay entry removes: an exact key, or a trailing-`.*` group. */
function resolveRemoval(rawKey: string, baseMetrics: MetricDataDef[], baseId: string): string[] {
  if (rawKey.endsWith(".*")) {
    const prefix = rawKey.slice(0, -2);
    const matches = baseMetrics.filter((m) => m.key === prefix || m.key.startsWith(`${prefix}.`));
    if (matches.length === 0) {
      throw new Error(`overlay wildcard "${rawKey}" matched no metrics in base "${baseId}"`);
    }
    return matches.map((m) => m.key);
  }
  if (!baseMetrics.some((m) => m.key === rawKey)) {
    throw new Error(`overlay cannot remove "${rawKey}": no such metric in base "${baseId}"`);
  }
  return [rawKey];
}

/**
 * The metric a non-`null` overlay entry yields: a patched clone of the existing
 * metric, or — for an unknown key carrying a complete definition — a new add. A
 * partial object on an unknown key is a typo'd patch target, so it throws.
 */
function resolveUpsert(
  rawKey: string,
  value: MetricPatch | MetricAdd,
  existing: MetricDataDef | undefined,
  baseId: string,
): MetricDataDef {
  if (rawKey.endsWith(".*")) {
    throw new Error(`overlay wildcard "${rawKey}" must be null (remove); got a value`);
  }
  if (existing) return applyPatch(existing, value);
  if (!value.label || !value.group) {
    throw new Error(
      `overlay cannot patch "${rawKey}": no such metric in base "${baseId}" ` +
        `(adding a metric requires a full definition with label + group)`,
    );
  }
  return metric(rawKey.replaceAll(".", "/"), value as MetricOpts);
}

/** Apply a keyed overlay over a clone of `baseMetrics`, returning fresh metrics. */
function deriveMetrics(
  baseMetrics: MetricDataDef[],
  overlay: MetricsOverlay,
  baseId: string,
): MetricDataDef[] {
  const byKey = new Map(baseMetrics.map((m) => [m.key, m]));
  const removed = new Set<string>();
  const patched = new Map<string, MetricDataDef>();
  const added: MetricDataDef[] = [];

  for (const [rawKey, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    if (value === null) {
      for (const key of resolveRemoval(rawKey, baseMetrics, baseId)) removed.add(key);
      continue;
    }
    const existing = byKey.get(rawKey);
    const derived = resolveUpsert(rawKey, value, existing, baseId);
    if (existing) patched.set(rawKey, derived);
    else added.push(derived);
  }

  const kept = baseMetrics
    .filter((m) => !removed.has(m.key))
    .map((m) => patched.get(m.key) ?? { ...m });
  return [...kept, ...added];
}

/**
 * Derive one self-contained profile from an existing `base` by overlaying
 * per-model tweaks. The low-level primitive behind {@link defineFamily}; use it
 * directly to specialize an imported or third-party {@link ProfileData}. Never
 * mutates `base`, so one base can spawn many models.
 */
export function defineVariant(
  base: ProfileData,
  overrides: ModelOverrides & { id: string },
): ProfileData {
  return {
    schemaVersion: 1,
    id: overrides.id,
    name: overrides.name ?? base.name,
    manufacturer: overrides.manufacturer ?? base.manufacturer,
    version: overrides.version ?? base.version,
    metrics: overrides.metrics
      ? deriveMetrics(base.metrics, overrides.metrics, base.id)
      : base.metrics.map((m) => ({ ...m })),
  };
}

/**
 * Co-located family: the shared base identity + register map, plus `models`
 * keyed by profile id. Returns the generic base profile first, then one
 * self-contained {@link ProfileData} per model. Generic over the metric list so
 * overlay keys are typed against the base (autocomplete + compile-time typos).
 */
export function defineFamily<const M extends readonly MetricDataDef[]>(def: {
  id: string;
  name: string;
  manufacturer: string;
  version: string;
  metrics: M;
  models: Record<string, ModelOverrides<M[number]["key"]>>;
}): ProfileData[] {
  const base = defineProfile({
    id: def.id,
    name: def.name,
    manufacturer: def.manufacturer,
    version: def.version,
    metrics: [...def.metrics],
  });
  return [base, ...Object.entries(def.models).map(([id, o]) => defineVariant(base, { id, ...o }))];
}
