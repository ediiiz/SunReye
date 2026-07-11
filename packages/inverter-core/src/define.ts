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
