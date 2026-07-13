import {
  ROLE_CATALOG,
  ROLE_NAMES,
  type CanonicalRole,
  type ProfileData,
  type RoleSpec,
} from "@SunReye/inverter-core";

export interface CoverageReport {
  total: number;
  mappedCount: number;
  /** Canonical roles the profile maps at least one metric onto. */
  mapped: CanonicalRole[];
  /** Renderable roles the profile does not map (the UI leaves these empty). */
  missing: CanonicalRole[];
}

/**
 * Which of the UI's renderable concepts ({@link ROLE_CATALOG}) this profile
 * maps. A missing role means the corresponding widget/section renders empty —
 * this is exactly what an author needs to know before shipping.
 */
export function coverage(data: ProfileData): CoverageReport {
  const present = new Set<CanonicalRole>();
  for (const m of data.metrics) if (m.role) present.add(m.role);

  const mapped = ROLE_NAMES.filter((r) => present.has(r));
  const missing = ROLE_NAMES.filter((r) => !present.has(r));
  return { total: ROLE_NAMES.length, mappedCount: mapped.length, mapped, missing };
}

/** Group roles by their leading segment (`pv`, `battery`, `grid`, …) for display. */
export function groupByPrefix(roles: CanonicalRole[]): Map<string, CanonicalRole[]> {
  const groups = new Map<string, CanonicalRole[]>();
  for (const r of roles) {
    const prefix = r.split(".")[0]!;
    (groups.get(prefix) ?? groups.set(prefix, []).get(prefix)!).push(r);
  }
  return groups;
}

/** True when a role is indexed (needs one metric per string/phase). */
export const isIndexedRole = (role: CanonicalRole): boolean =>
  (ROLE_CATALOG[role] as RoleSpec).indexed === true;

/** A hand-listed `sum` that exactly covers an indexed role group — a `sumOf` candidate. */
export interface AggregateSuggestion {
  /** The computed metric whose `computeExpr` could become a `sumOf`. */
  key: string;
  /** The indexed role its summed keys exactly cover. */
  role: CanonicalRole;
  /** How many metrics are in that role group (= the sum's length). */
  count: number;
}

/** The indexed role whose full metric group (excluding `selfKey`) equals `summed`, if any. */
function indexedRoleCoveredExactly(
  summed: string[],
  selfKey: string,
  byRole: Map<CanonicalRole, string[]>,
): CanonicalRole | undefined {
  for (const [role, keys] of byRole) {
    if (!isIndexedRole(role)) continue;
    const group = keys.filter((k) => k !== selfKey).sort();
    if (group.length === summed.length && group.every((k, i) => k === summed[i])) return role;
  }
  return undefined;
}

/**
 * Non-destructive lint: find computed metrics whose explicit
 * `computeExpr: { sum: [...] }` lists **exactly** every metric of some indexed
 * role (PV strings, phases). Those are the drift-prone, per-SKU-varying groups
 * where `sumOf({ role })` is equivalent *and* self-heals when a variant adds or
 * drops a member — so we suggest it, but never rewrite. Restricted to indexed
 * roles to stay precise: a heterogeneous or single-member sum isn't a candidate.
 */
export function suggestAggregates(data: ProfileData): AggregateSuggestion[] {
  const byRole = new Map<CanonicalRole, string[]>();
  for (const m of data.metrics) {
    if (m.role) (byRole.get(m.role) ?? byRole.set(m.role, []).get(m.role)!).push(m.key);
  }

  const suggestions: AggregateSuggestion[] = [];
  for (const m of data.metrics) {
    const expr = m.computeExpr;
    if (!expr || !("sum" in expr) || expr.sum.length < 2) continue;
    const role = indexedRoleCoveredExactly([...expr.sum].sort(), m.key, byRole);
    if (role) suggestions.push({ key: m.key, role, count: expr.sum.length });
  }
  return suggestions;
}
