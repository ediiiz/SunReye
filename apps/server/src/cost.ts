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
import { importPriceForHour } from "@SunReye/db/tariff";
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

/** Granularity of a {@link computeCostSeries} bar. */
export type CostBucket = "hour" | "day" | "month";

/** One bar of the cost time-series: net (= import − export) money in a period. */
export interface CostSeriesPoint {
  /** Local period key: `YYYY-MM-DDTHH` (hour) | `YYYY-MM-DD` (day) | `YYYY-MM` (month). */
  bucket: string;
  importCost: number;
  exportEarnings: number;
  /** `importCost − exportEarnings` (no standing charge — matches CostTotals.byDay). */
  net: number;
}

/** SQL date_trunc unit + the `to_char` mask that renders its local period key. */
const PERIOD_FORMAT: Record<CostBucket, { unit: string; mask: string }> = {
  hour: { unit: "hour", mask: 'YYYY-MM-DD"T"HH24' },
  day: { unit: "day", mask: "YYYY-MM-DD" },
  month: { unit: "month", mask: "YYYY-MM" },
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Local period key for a Date, matching the SQL `to_char` masks above. */
function periodKey(d: Date, bucket: CostBucket): string {
  const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (bucket === "month") return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  if (bucket === "day") return ymd;
  return `${ymd}T${pad2(d.getHours())}`;
}

/**
 * Every local period key in `[from, to)` at `bucket` granularity, oldest first.
 * Drives zero-fill so the chart x-axis is stable and gap-free regardless of
 * which periods actually have data. Stepping uses local calendar fields so
 * month lengths and DST are handled by the Date arithmetic itself.
 */
function periodKeysInRange(from: Date, to: Date, bucket: CostBucket): string[] {
  const keys: string[] = [];
  const cur =
    bucket === "month"
      ? new Date(from.getFullYear(), from.getMonth(), 1)
      : bucket === "day"
        ? new Date(from.getFullYear(), from.getMonth(), from.getDate())
        : new Date(from.getFullYear(), from.getMonth(), from.getDate(), from.getHours());
  while (cur < to) {
    keys.push(periodKey(cur, bucket));
    if (bucket === "month") cur.setMonth(cur.getMonth() + 1);
    else if (bucket === "day") cur.setDate(cur.getDate() + 1);
    else cur.setHours(cur.getHours() + 1);
  }
  return keys;
}

/**
 * Net cost per period ([from, to), one point per `bucket`), tariff-band accurate
 * and zero-filled. The heavy lifting stays in SQL: the counter delta is computed
 * with a window function (`max_value − prev max_value`, clamped ≥0) and the
 * result pre-aggregated to a bounded `(period, hour-of-day, ISO-weekday, metric)`
 * matrix — so the row count is fixed by the calendar shape (≤ periods·24·7·keys),
 * never by how many hourly rows the window spans. Pricing then applies the
 * time-of-use band per (hour, weekday) group in JS, exactly as {@link allocateCost}
 * would per hour, without shipping every hour across the wire.
 *
 * Local time: buckets are stored UTC, but bands are defined in wall-clock time,
 * so the period/hour/weekday are all derived from `bucket AT TIME ZONE <server tz>`
 * — matching the JS-local pricing the per-hour path uses. The window function's
 * first bucket has no predecessor and is dropped (null `lag`), costing at most one
 * hour of energy at the very start of the window.
 */
export async function computeCostSeries(
  profile: InverterProfile,
  opts: { from: Date; to: Date; bucket: CostBucket; inverterId?: string },
): Promise<CostSeriesPoint[]> {
  const { from, to, bucket } = opts;
  const inverterId = opts.inverterId ?? profile.id;

  const byKey = new Map(byBucketPoints(periodKeysInRange(from, to, bucket)));
  // Only import/export flows carry money; skip load/production to keep the scan lean.
  const priced = new Map(
    [...resolveEnergyKeys(profile)].filter(([, f]) => f === "import" || f === "export"),
  );
  if (priced.size === 0) return [...byKey.values()];

  const tariff = await getTariff();
  const { unit, mask } = PERIOD_FORMAT[bucket];
  // Server-local IANA zone so SQL wall-clock matches the per-hour path's getHours().
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const keyList = sql.join(
    [...priced.keys()].map((k) => sql`${k}`),
    sql`, `,
  );

  const rows = await db.execute<{
    period: string;
    hod: number;
    dow: number;
    metric: string;
    kwh: number;
  }>(sql`
    with deltas as (
      select
        (bucket at time zone ${tz}) as local_bucket,
        metric,
        greatest(0, max_value - lag(max_value) over (partition by metric order by bucket)) as kwh
      from hourly_rollups
      where inverter_id = ${inverterId}
        and metric in (${keyList})
        and bucket >= ${from}
        and bucket < ${to}
    )
    select
      to_char(date_trunc(${unit}, local_bucket), ${mask}) as period,
      extract(hour from local_bucket)::int as hod,
      extract(isodow from local_bucket)::int as dow,
      metric,
      sum(kwh) as kwh
    from deltas
    group by 1, 2, 3, 4
  `);

  for (const r of rows.rows) {
    const field = priced.get(r.metric);
    if (!field) continue;
    const point = byKey.get(r.period);
    if (!point) continue; // outside the zero-filled window (edge rounding) → ignore
    const kwh = Number(r.kwh);
    if (field === "import") {
      point.importCost += kwh * importPriceForHour(tariff, Number(r.hod), Number(r.dow));
    } else {
      point.exportEarnings += kwh * tariff.export.feedInPerKwh;
    }
    point.net = point.importCost - point.exportEarnings;
  }
  return [...byKey.values()];
}

/** Zero-filled `[key, point]` pairs in order, seeding the accumulator map. */
function byBucketPoints(keys: string[]): Array<[string, CostSeriesPoint]> {
  return keys.map((bucket) => [bucket, { bucket, importCost: 0, exportEarnings: 0, net: 0 }]);
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
