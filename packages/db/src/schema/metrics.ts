import { integer, pgTable, smallint, timestamp } from "drizzle-orm/pg-core";

/**
 * 1-second resolution live inverter samples.
 *
 * This table is promoted to a TimescaleDB hypertable (partitioned on `time`)
 * by the raw SQL in `src/timescale.sql`. Drizzle only manages the column
 * shape; the hypertable + continuous aggregate DDL is applied separately via
 * `bun run db:timescale` because drizzle-kit cannot express those.
 */
export const metricsRaw = pgTable("metrics_raw", {
  time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
  pvPowerW: integer("pv_power_w").notNull(),
  batterySoc: smallint("battery_soc").notNull(),
  gridPowerW: integer("grid_power_w").notNull(),
});

export type MetricsRow = typeof metricsRaw.$inferSelect;
export type MetricsInsert = typeof metricsRaw.$inferInsert;
