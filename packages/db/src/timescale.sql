-- TimescaleDB bootstrap for the inverter dashboard.
-- Apply after `db:push` has created the `metrics_raw` table: `bun run db:timescale`.
-- Statements are separated by the drizzle statement-breakpoint marker; each runs
-- on its own (continuous aggregates cannot be created inside a transaction block).

CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint

-- Promote metrics_raw to a hypertable partitioned on the time column.
-- migrate_data handles the case where the poll loop already wrote rows before
-- the table was promoted to a hypertable.
-- create_default_indexes => FALSE: the time index (`metrics_raw_time_idx`) is
-- declared in the drizzle schema instead, so `drizzle-kit push` owns it and
-- won't drop an out-of-band index it doesn't know about.
SELECT create_hypertable('metrics_raw', 'time', if_not_exists => TRUE, migrate_data => TRUE, create_default_indexes => FALSE);
--> statement-breakpoint

-- Per-minute rollup, per (inverter, metric). Powers short-horizon history
-- (last hours) at fine resolution without scanning raw 1 Hz rows.
CREATE MATERIALIZED VIEW IF NOT EXISTS minute_rollups
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', time) AS bucket,
  inverter_id,
  metric,
  avg(value) AS avg_value,
  max(value) AS max_value,
  min(value) AS min_value
FROM metrics_raw
GROUP BY bucket, inverter_id, metric
WITH NO DATA;
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
SELECT add_continuous_aggregate_policy('minute_rollups',
  start_offset => INTERVAL '10 minutes',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => TRUE);
--> statement-breakpoint

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
ALTER MATERIALIZED VIEW minute_rollups SET (timescaledb.materialized_only = false);
--> statement-breakpoint

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
--> statement-breakpoint

-- Retention (cleanup). Drop raw 1 Hz rows after 30 days: by then they are
-- compressed (>7d) and fully materialized into every rollup, so nothing that
-- reads the aggregates loses data. 30d comfortably exceeds the widest
-- continuous-aggregate refresh window (daily start_offset = 3 days), so the
-- real-time union never reaches for chunks that retention has dropped.
SELECT add_retention_policy('metrics_raw', INTERVAL '30 days', if_not_exists => TRUE);
--> statement-breakpoint

-- Tiered rollup retention. Each aggregate is built directly from metrics_raw
-- (not from a coarser rollup), so these policies are independent and drop only
-- their own already-materialized buckets. daily_rollups has no policy — kept
-- forever as the cheap long-horizon record.
SELECT add_retention_policy('minute_rollups', INTERVAL '90 days', if_not_exists => TRUE);
--> statement-breakpoint

SELECT add_retention_policy('hourly_rollups', INTERVAL '730 days', if_not_exists => TRUE);
