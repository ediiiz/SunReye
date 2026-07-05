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
