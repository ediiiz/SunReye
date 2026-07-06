/**
 * Cost engine: turns stored energy flows into money using the active tariff.
 *
 * Energy comes from the hourly TimescaleDB rollups of the inverter's monotonic
 * lifetime counters (imported/exported/load/production kWh): energy in a bucket
 * is the counter's rise since the *previous* bucket (`max_value` delta), clamped
 * ≥0 so a reset costs one bucket, not the whole lifetime total. The pricing
 * arithmetic is pure
 * and unit-tested in {@link ./cost-calc}. Metrics are resolved by canonical
 * role, never vendor keys, so any profile exposing the standard energy roles
 * gets cost tracking for free.
 */

import { db } from "@SunReye/db";
import type { CanonicalRole, InverterProfile } from "@SunReye/inverter-core";
import { sql } from "drizzle-orm";
import { type CostBreakdown, type HourEnergy, allocateCost } from "./cost-calc";
import { getTariff } from "./settings";

export type { CostBreakdown } from "./cost-calc";
export { resolveRange } from "./cost-calc";

/** The energy-counter metric key for a role in this profile, if present. */
function keyForRole(p: InverterProfile, role: CanonicalRole): string | undefined {
  return p.metrics.find((m) => m.role === role)?.key;
}

/** The {@link HourEnergy} fields we price, and the role backing each. */
const ENERGY_FIELDS = {
  import: "grid.energy.imported.total",
  export: "grid.energy.exported.total",
  load: "load.energy.total",
  production: "production.total",
} as const satisfies Record<keyof Omit<HourEnergy, "time">, CanonicalRole>;

type EnergyField = keyof Omit<HourEnergy, "time">;

/** The continuous-aggregate views we can read counter deltas from. */
type RollupView = "hourly_rollups" | "daily_rollups";

/** Metric key → the HourEnergy field it feeds, for the roles this profile has. */
function resolveEnergyKeys(profile: InverterProfile): Map<string, EnergyField> {
  const fieldByKey = new Map<string, EnergyField>();
  for (const [field, role] of Object.entries(ENERGY_FIELDS)) {
    const key = keyForRole(profile, role);
    if (key) fieldByKey.set(key, field as EnergyField);
  }
  return fieldByKey;
}

/**
 * Read per-bucket energy for the energy roles this profile exposes, over
 * [from, to). Energy in a bucket is the monotonic counter's rise since the
 * previous bucket — `max_value − prior max_value`, clamped ≥0. `max_value` is
 * the bucket's high-water counter reading; using the cross-bucket delta (not the
 * intra-bucket `max − min`) means a spurious low read or a counter reset costs
 * at most a single bucket instead of pricing the entire lifetime total.
 *
 * The bucket immediately before `from` is read first as a baseline so the first
 * in-range bucket is a delta from real prior state; without a baseline (no data
 * before `from`) the first bucket falls back to its own `max − min`.
 *
 * `view` selects the rollup granularity (hourly for cost banding, daily for long
 * windows); both continuous aggregates share the same column shape.
 */
async function fetchBucketEnergy(
  profile: InverterProfile,
  inverterId: string,
  from: Date,
  to: Date,
  view: RollupView,
): Promise<HourEnergy[]> {
  const fieldByKey = resolveEnergyKeys(profile);
  if (fieldByKey.size === 0) return [];

  // `view` is a fixed internal literal (not user input), so it is safe to
  // interpolate as a raw identifier; everything else stays parameterized.
  const viewSql = sql.raw(view);
  const keyList = sql.join(
    [...fieldByKey.keys()].map((k) => sql`${k}`),
    sql`, `,
  );

  // Cumulative counter level entering the window, per metric (last bucket before
  // `from`). Seeds the delta chain so the first in-range bucket is priced as a
  // rise from prior state rather than from its own intra-bucket minimum.
  const baselineRows = await db.execute<{ metric: string; last_max: number }>(sql`
    select distinct on (metric) metric, max_value as last_max
    from ${viewSql}
    where inverter_id = ${inverterId}
      and metric in (${keyList})
      and bucket < ${from}
    order by metric, bucket desc
  `);
  const prev = new Map<string, number>();
  for (const r of baselineRows.rows) prev.set(r.metric, Number(r.last_max));

  const rows = await db.execute<{
    bucket: string | Date;
    metric: string;
    max_value: number;
    min_value: number;
  }>(sql`
    select bucket, metric, max_value, min_value
    from ${viewSql}
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
    const max = Number(r.max_value);
    // No baseline for the very first bucket of the counter's history → use its
    // own intra-bucket delta; otherwise rise since the previous bucket's high.
    const prior = prev.get(r.metric) ?? Number(r.min_value);
    prev.set(r.metric, max);

    const time = new Date(r.bucket);
    const hour = byBucket.get(time.getTime()) ?? {
      time,
      import: 0,
      export: 0,
      load: 0,
      production: 0,
    };
    hour[field] += Math.max(0, max - prior);
    byBucket.set(time.getTime(), hour);
  }
  return [...byBucket.values()];
}

/** Read hourly energy for cost banding. Thin wrapper over {@link fetchBucketEnergy}. */
function fetchHourlyEnergy(
  profile: InverterProfile,
  inverterId: string,
  from: Date,
  to: Date,
): Promise<HourEnergy[]> {
  return fetchBucketEnergy(profile, inverterId, from, to, "hourly_rollups");
}

/** Read daily energy for long-window (e.g. monthly) aggregation. */
export function fetchDailyEnergy(
  profile: InverterProfile,
  inverterId: string,
  from: Date,
  to: Date,
): Promise<HourEnergy[]> {
  return fetchBucketEnergy(profile, inverterId, from, to, "daily_rollups");
}

/** Full cost breakdown for an explicit [from, to) window. */
export async function computeCost(
  profile: InverterProfile,
  opts: {
    from: Date;
    to: Date;
    inverterId?: string;
  },
): Promise<CostBreakdown> {
  const inverterId = opts.inverterId ?? profile.id;
  const tariff = await getTariff();
  const hours = await fetchHourlyEnergy(profile, inverterId, opts.from, opts.to);
  const rangeDays = Math.max(0, (opts.to.getTime() - opts.from.getTime()) / 86_400_000);
  return {
    currency: tariff.currency,
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    ...allocateCost(hours, tariff, rangeDays),
  };
}
