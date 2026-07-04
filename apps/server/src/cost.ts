/**
 * Cost engine: turns stored energy flows into money using the active tariff.
 *
 * Energy comes from the hourly TimescaleDB rollups of the inverter's monotonic
 * lifetime counters (imported/exported/load/production kWh): energy in an hour
 * is that counter's `max - min` over the bucket. The pricing arithmetic is pure
 * and unit-tested in {@link ./cost-calc}. Metrics are resolved by canonical
 * role, never vendor keys, so any profile exposing the standard energy roles
 * gets cost tracking for free.
 */

import { db } from "@ReyeON/db";
import type { CanonicalRole, InverterProfile } from "@ReyeON/inverter-core";
import { sql } from "drizzle-orm";
import { type CostBreakdown, type HourEnergy, allocateCost } from "./cost-calc";
import { profile } from "./inverter";
import { getTariff } from "./settings";

export type { CostBreakdown } from "./cost-calc";
export { resolveRange } from "./cost-calc";

/** The energy-counter metric key for a role in this profile, if present. */
function keyForRole(p: InverterProfile, role: CanonicalRole): string | undefined {
  return p.metrics.find((m) => m.role === role)?.key;
}

/**
 * Read hourly per-metric energy (counter `max - min`, clamped ≥0 to tolerate
 * counter resets) for the energy roles this profile exposes, over [from, to).
 */
/** The {@link HourEnergy} fields we price, and the role backing each. */
const ENERGY_FIELDS = {
  import: "grid.energy.imported.total",
  export: "grid.energy.exported.total",
  load: "load.energy.total",
  production: "production.total",
} as const satisfies Record<keyof Omit<HourEnergy, "time">, CanonicalRole>;

type EnergyField = keyof Omit<HourEnergy, "time">;

/** Metric key → the HourEnergy field it feeds, for the roles this profile has. */
function resolveEnergyKeys(): Map<string, EnergyField> {
  const fieldByKey = new Map<string, EnergyField>();
  for (const [field, role] of Object.entries(ENERGY_FIELDS)) {
    const key = keyForRole(profile, role);
    if (key) fieldByKey.set(key, field as EnergyField);
  }
  return fieldByKey;
}

async function fetchHourlyEnergy(inverterId: string, from: Date, to: Date): Promise<HourEnergy[]> {
  const fieldByKey = resolveEnergyKeys();
  if (fieldByKey.size === 0) return [];

  const keyList = sql.join(
    [...fieldByKey.keys()].map((k) => sql`${k}`),
    sql`, `,
  );
  const rows = await db.execute<{
    bucket: string | Date;
    metric: string;
    max_value: number;
    min_value: number;
  }>(sql`
    select bucket, metric, max_value, min_value
    from hourly_rollups
    where inverter_id = ${inverterId}
      and metric in (${keyList})
      and bucket >= ${from}
      and bucket < ${to}
    order by bucket asc
  `);

  const byBucket = new Map<number, HourEnergy>();
  for (const r of rows.rows) {
    const field = fieldByKey.get(r.metric);
    if (!field) continue;
    const time = new Date(r.bucket);
    const hour = byBucket.get(time.getTime()) ?? {
      time,
      import: 0,
      export: 0,
      load: 0,
      production: 0,
    };
    hour[field] += Math.max(0, Number(r.max_value) - Number(r.min_value));
    byBucket.set(time.getTime(), hour);
  }
  return [...byBucket.values()];
}

/** Full cost breakdown for an explicit [from, to) window. */
export async function computeCost(opts: {
  from: Date;
  to: Date;
  inverterId?: string;
}): Promise<CostBreakdown> {
  const inverterId = opts.inverterId ?? profile.id;
  const tariff = await getTariff();
  const hours = await fetchHourlyEnergy(inverterId, opts.from, opts.to);
  const rangeDays = Math.max(0, (opts.to.getTime() - opts.from.getTime()) / 86_400_000);
  return {
    currency: tariff.currency,
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    ...allocateCost(hours, tariff, rangeDays),
  };
}
