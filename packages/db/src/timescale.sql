-- TimescaleDB bootstrap for the Deye dashboard.
-- Apply after `db:push` has created the `metrics_raw` table: `bun run db:timescale`.
-- Statements are separated by `--> statement-breakpoint`; each runs on its own
-- (continuous aggregates cannot be created inside a transaction block).

CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint

-- Promote metrics_raw to a hypertable partitioned on the time column.
SELECT create_hypertable('metrics_raw', 'time', if_not_exists => TRUE);
--> statement-breakpoint

-- Hourly rollup (background-materialized by TimescaleDB).
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_rollups
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  avg(pv_power_w)   AS avg_pv_power_w,
  max(pv_power_w)   AS max_pv_power_w,
  avg(battery_soc)  AS avg_battery_soc,
  avg(grid_power_w) AS avg_grid_power_w
FROM metrics_raw
GROUP BY bucket
WITH NO DATA;
--> statement-breakpoint

-- Daily rollup.
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_rollups
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  avg(pv_power_w)   AS avg_pv_power_w,
  max(pv_power_w)   AS max_pv_power_w,
  avg(battery_soc)  AS avg_battery_soc,
  avg(grid_power_w) AS avg_grid_power_w
FROM metrics_raw
GROUP BY bucket
WITH NO DATA;
--> statement-breakpoint

-- Keep the rollups current in the background.
SELECT add_continuous_aggregate_policy('hourly_rollups',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE);
--> statement-breakpoint

SELECT add_continuous_aggregate_policy('daily_rollups',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE);
--> statement-breakpoint

-- Compress raw rows older than 7 days to hit the ~5-year / ~1.5B-row target.
ALTER TABLE metrics_raw SET (
  timescaledb.compress,
  timescaledb.compress_orderby = 'time DESC'
);
--> statement-breakpoint

SELECT add_compression_policy('metrics_raw', INTERVAL '7 days', if_not_exists => TRUE);
