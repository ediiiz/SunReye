import { doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 1-second resolution inverter samples in long ("narrow") form: one row per
 * metric per tick. This keeps the schema fixed while the *set* of metrics is
 * defined entirely by the active inverter profile — so new inverters /
 * downloadable config packages need no migration.
 *
 * Promoted to a TimescaleDB hypertable (partitioned on `time`) with per-metric
 * continuous-aggregate rollups by the raw SQL in `src/timescale.sql`; drizzle
 * only manages the column shape. Apply via `bun run db:timescale`.
 */
export const metricsRaw = pgTable(
  "metrics_raw",
  {
    time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
    inverterId: text("inverter_id").notNull(),
    metric: text("metric").notNull(),
    value: doublePrecision("value").notNull(),
  },
  (t) => [
    index("metrics_raw_metric_time_idx").on(t.inverterId, t.metric, t.time),
    // Time-only index for pure time-range scans (e.g. /api/history). Owned by
    // drizzle so `push` doesn't try to drop it — TimescaleDB's `create_hypertable`
    // is configured with `create_default_indexes => FALSE` precisely so this is
    // the single source of truth for the time index (see src/timescale.sql).
    index("metrics_raw_time_idx").on(t.time.desc()),
  ],
);

export type MetricsRow = typeof metricsRaw.$inferSelect;
export type MetricsInsert = typeof metricsRaw.$inferInsert;
