/**
 * Shared time-series reads for one entity, used by both the web-facing history
 * endpoints (`index.ts`) and the generated `/api/v1` entity history route
 * (`entities.ts`) so the SQL + row shaping live in one place.
 */

import { db } from "@SunReye/db";
import { metricsRaw } from "@SunReye/db/schema/metrics";
import { and, desc, eq, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** Rollup granularity → its TimescaleDB continuous aggregate view. */
export type RollupBucket = "minute" | "hour" | "day";

const viewFor = (bucket: RollupBucket): string =>
  bucket === "day" ? "daily_rollups" : bucket === "minute" ? "minute_rollups" : "hourly_rollups";

interface HistoryQuery {
  metric: string;
  inverterId: string;
  since: Date;
  limit: number;
}

/** Downsampled rollup series (ascending), from a continuous aggregate view. */
export async function queryRollup(
  q: HistoryQuery & { bucket: RollupBucket },
): Promise<Array<{ time: string; avg: number; max: number; min: number }>> {
  const view = sql.raw(viewFor(q.bucket));
  const result = await db.execute<{
    bucket: string | Date;
    avg_value: number;
    max_value: number;
    min_value: number;
  }>(sql`
    select bucket, avg_value, max_value, min_value
    from ${view}
    where metric = ${q.metric}
      and inverter_id = ${q.inverterId}
      and bucket >= ${q.since}
    order by bucket asc
    limit ${q.limit}
  `);
  return result.rows.map((r) => ({
    time: new Date(r.bucket).toISOString(),
    avg: Number(r.avg_value),
    max: Number(r.max_value),
    min: Number(r.min_value),
  }));
}

/** Raw samples for one metric, most-recent-first. */
export async function queryRawHistory(
  q: HistoryQuery,
): Promise<Array<{ time: string; value: number }>> {
  const rows = await db
    .select()
    .from(metricsRaw)
    .where(
      and(
        gte(metricsRaw.time, q.since),
        eq(metricsRaw.metric, q.metric),
        eq(metricsRaw.inverterId, q.inverterId),
      ),
    )
    .orderBy(desc(metricsRaw.time))
    .limit(q.limit);
  return rows.map((r) => ({ time: r.time.toISOString(), value: r.value }));
}
