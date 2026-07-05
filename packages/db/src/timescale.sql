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
-- chunk_time_interval => 1 day: small chunks so the compression policy can
-- compress everything but the current day. The uncompressed hot window is the
-- single largest storage line item at 1 Hz, so keeping it to ~1 day is what
-- makes the long-horizon budget work.
SELECT create_hypertable('metrics_raw', 'time', if_not_exists => TRUE, migrate_data => TRUE, create_default_indexes => FALSE, chunk_time_interval => INTERVAL '1 day');
--> statement-breakpoint

-- create_hypertable only sets chunk_time_interval for a *new* hypertable; make
-- it authoritative for existing deployments too (affects future chunks only —
-- any pre-existing wide chunk ages out via the retention policy below).
SELECT set_chunk_time_interval('metrics_raw', INTERVAL '1 day');
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

-- Compress everything older than the current day. Measured ~45x on this 1 Hz
-- narrow-form data: compress_segmentby stores the repeated inverter_id/metric
-- text once per segment, and time+value delta-compress to almost nothing. A
-- compressed day is ~0.1-0.2 GB vs ~5-9 GB uncompressed. The nightly
-- daily_rollups refresh (start_offset 3 days) decompresses a couple of chunks
-- once per day on read — negligible.
ALTER TABLE metrics_raw SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'inverter_id, metric',
  timescaledb.compress_orderby = 'time DESC'
);
--> statement-breakpoint

-- remove+add (rather than add-if-not-exists) so re-running db:timescale is
-- authoritative when the interval changes on an already-configured deployment;
-- add_compression_policy(if_not_exists) would silently keep the old interval.
SELECT remove_compression_policy('metrics_raw', if_exists => TRUE);
--> statement-breakpoint

SELECT add_compression_policy('metrics_raw', INTERVAL '1 day', if_not_exists => TRUE);
--> statement-breakpoint

-- Retention (cleanup). Drop raw 1 Hz rows after 7 days — the feasible floor.
-- It must comfortably exceed the widest continuous-aggregate refresh window
-- (daily_rollups start_offset = 3 days) so neither the refresh nor the
-- real-time union ever reaches a chunk retention has dropped; 7d leaves margin.
-- By 7 days rows are compressed (>1d) and fully materialized into every rollup,
-- so nothing that reads the aggregates loses data. 7d = ~1 day uncompressed +
-- ~6 days compressed (~10 GB for one inverter); long-horizon history lives in
-- the rollups, not here. Shorten further per-inverter as inverters are added.
SELECT remove_retention_policy('metrics_raw', if_exists => TRUE);
--> statement-breakpoint

SELECT add_retention_policy('metrics_raw', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint

-- Compress the minute rollups. At 90 days of per-minute buckets per series this
-- is the only rollup large enough to matter; hourly/daily are trivially small
-- and left uncompressed. Keep the recent 7 days uncompressed for fast
-- short-horizon reads, compress the rest.
ALTER MATERIALIZED VIEW minute_rollups SET (timescaledb.compress = true);
--> statement-breakpoint

SELECT add_compression_policy('minute_rollups', INTERVAL '7 days', if_not_exists => TRUE);
--> statement-breakpoint

-- Tiered rollup retention. Each aggregate is built directly from metrics_raw
-- (not from a coarser rollup), so these policies are independent and drop only
-- their own already-materialized buckets. daily_rollups has no policy — kept
-- forever as the cheap long-horizon record.
SELECT add_retention_policy('minute_rollups', INTERVAL '90 days', if_not_exists => TRUE);
--> statement-breakpoint

SELECT add_retention_policy('hourly_rollups', INTERVAL '730 days', if_not_exists => TRUE);
