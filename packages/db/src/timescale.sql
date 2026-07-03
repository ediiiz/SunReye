-- TimescaleDB bootstrap for the inverter dashboard.
-- Apply after `db:push` has created the `metrics_raw` table: `bun run db:timescale`.
-- Statements are separated by the drizzle statement-breakpoint marker; each runs
-- on its own (continuous aggregates cannot be created inside a transaction block).

CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint

-- Promote metrics_raw to a hypertable partitioned on the time column.
-- migrate_data handles the case where the poll loop already wrote rows before
-- the table was promoted to a hypertable.
SELECT create_hypertable('metrics_raw', 'time', if_not_exists => TRUE, migrate_data => TRUE);
--> statement-breakpoint

-- Hourly rollup, per (inverter, metric). Long form generalizes across every
-- inverter profile without per-metric DDL.
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_rollups
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  inverter_id,
  metric,
  avg(value) AS avg_value,
  max(value) AS max_value,
  min(value) AS min_value
FROM metrics_raw
GROUP BY bucket, inverter_id, metric
WITH NO DATA;
--> statement-breakpoint

-- Daily rollup.
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_rollups
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  inverter_id,
  metric,
  avg(value) AS avg_value,
  max(value) AS max_value,
  min(value) AS min_value
FROM metrics_raw
GROUP BY bucket, inverter_id, metric
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

-- Real-time aggregation: the view unions materialized buckets with the most
-- recent (not-yet-materialized) window computed on the fly from raw rows, so a
-- chart always includes the latest data without waiting for the refresh policy.
ALTER MATERIALIZED VIEW hourly_rollups SET (timescaledb.materialized_only = false);
--> statement-breakpoint

ALTER MATERIALIZED VIEW daily_rollups SET (timescaledb.materialized_only = false);
--> statement-breakpoint

-- Compress raw rows older than 7 days, segmented by series, to hit the
-- long-horizon storage target.
ALTER TABLE metrics_raw SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'inverter_id, metric',
  timescaledb.compress_orderby = 'time DESC'
);
--> statement-breakpoint

SELECT add_compression_policy('metrics_raw', INTERVAL '7 days', if_not_exists => TRUE);
