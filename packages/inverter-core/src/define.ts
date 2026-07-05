import type { CanonicalRole } from "./roles";
import { ROLE_CATALOG } from "./roles";
import type { ComputeExpr, MetricDataDef, ProfileData } from "./profile-data";
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

/** Build one metric. The canonical `key` is the topic with `/` → `.`. */
export function metric(topic: string, opts: MetricOpts): MetricDataDef {
  const { addr } = opts;
  return {
    key: topic.replaceAll("/", "."),
    topic,
    label: opts.label,
    unit: opts.unit ?? null,
    group: opts.group,
    type: opts.type ?? "U_WORD",
    addresses: addr === undefined ? [] : Array.isArray(addr) ? addr : [addr],
    scale: opts.scale ?? 1,
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
