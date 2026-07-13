---
title: Requirements
description: What you need to run SunReye.
---

## Runtime

- **[bun](https://bun.sh/)** — the JavaScript runtime and package manager the whole
  monorepo uses. Install it first.
- **PostgreSQL with TimescaleDB** — telemetry is stored in a hypertable with
  continuous-aggregate rollups. The project ships a Docker Compose file that runs a
  pinned `timescale/timescaledb:*-pg17` image; you can also point at any existing
  PostgreSQL + TimescaleDB instance via `DATABASE_URL`.
- **Docker** (recommended) — used both for the local database and for the
  [full-stack deployment](/deploy/docker/).

## Hardware (optional)

An inverter is **not** required to run SunReye. The built-in
[simulator](/start/quick-start/) (`INVERTER_SIMULATE=true`, the default) generates coherent
fake telemetry, so you can develop, demo, and evaluate the whole stack with no hardware.

To connect real hardware you need an inverter reachable over **Modbus TCP** (or
**RTU-over-TCP** via a serial gateway) on your network. Support is profile-driven — see
[Supported Inverters](/profiles/supported/).

### Recommended hardware

These are devices the maintainer runs and can vouch for — they work really well in practice.
Nothing here is required; any Modbus-TCP-capable gateway will do.

- **Waveshare Modbus gateway (PoE)** — bridges the inverter's serial Modbus to **Modbus TCP**
  (or **Modbus RTU over TCP**) on Ethernet, so SunReye can poll it over the network. PoE means
  a single cable for power and data. [Search on Amazon](https://amzn.to/452b4DC).
- **DIN-rail-mount gateway** — fits into a DIN rail slot with a little trimming of the window
  plastic. Available in two variants:
  - [Non-PoE](https://amzn.to/4eYeVHP)
  - [PoE](https://amzn.to/4aKZh00)

> The Amazon links above are affiliate links — buying through them supports SunReye at no
> extra cost to you.

## Storage

Telemetry is stored in TimescaleDB as narrow rows — **one row per metric per poll**. At the
default **1 Hz** poll rate (`POLL_INTERVAL_MS=1000`) a Deye/Sunsynk inverter with ~99 metrics
writes ~99 rows every second, or **~8.5 million rows per day per inverter**.

### How much is written

This is the raw ingest volume before compression — useful for understanding throughput, but
**not** what you provision (see below).

| Window | Rows written | Uncompressed |
| --- | --- | --- |
| Day | ~8.5 million | ~5–9 GB |
| Week | ~60 million | ~35–65 GB |
| Month | ~260 million | ~150–270 GB |
| Year | ~3.1 billion | ~1.8–3.3 TB |

### How much is actually stored on disk

Disk usage is **bounded and roughly flat** — it does *not* grow with the numbers above. Two
mechanisms keep it in check:

- **Compression** — chunks older than a day are compressed at a measured **~45×**, so a day of
  raw data drops from ~5–9 GB to ~0.1–0.2 GB.
- **Retention** — raw 1 Hz rows are dropped after **7 days**; long-horizon history lives in the
  rollups instead:

  | Data | Resolution | Retention |
  | --- | --- | --- |
  | `metrics_raw` | 1 s | 7 days |
  | `minute_rollups` | 1 min | 90 days |
  | `hourly_rollups` | 1 hour | 730 days (2 years) |
  | `daily_rollups` | 1 day | forever |

Net steady-state footprint is roughly **~10 GB for the raw 7-day window** (~1 day uncompressed +
~6 days compressed) plus a few GB of rollups. Only `daily_rollups` grows without bound, at ~99
rows/day — negligible. **Provision ~15 GB per inverter** with headroom and you are comfortable
indefinitely.

Both the poll rate and every retention/compression interval are tunable — see the retention and
compression policies in `packages/db/src/timescale/policies.sql`. Lowering the poll rate or
shortening raw retention scales the figures down proportionally.

### SSD endurance (TBW)

The **on-disk footprint stays flat, but the drive is written to continuously** — this is what
determines SSD lifetime, and it is a *larger* number than the logical data volume above. Every
row is written to the write-ahead log **and** the heap, plus **two indexes** on `metrics_raw`,
plus full-page images after each checkpoint, plus the daily compression job rewriting a day's
chunk. In practice physical writes land at roughly **3–5×** the logical figure:

| | Per day | Per year |
| --- | --- | --- |
| Logical data | ~5–9 GB | — (bounded by retention) |
| Physical writes to device (TBW) | ~20–45 GB | **~10–15 TB / inverter** |

For context, a modest consumer SSD is rated for ~300–600 **TBW** (roughly 0.3 drive-writes/day
over 5 years). At ~10–15 TB/year, **a single 250 GB+ SSD lasts well over a decade** for one
inverter — endurance is not a concern on real SSDs.

**It *is* a concern on the wrong media:**

- **Do not run the database on an SD card or eMMC** (the default storage on a Raspberry Pi, and
  common under the Home Assistant addon). At tens of GB/day these have no meaningful write
  endurance and will fail in months. Put the Postgres data directory on an SSD (SATA or NVMe).
- Writes scale **linearly per inverter** and with poll rate — several inverters or a faster poll
  rate multiply TBW accordingly.

#### What SunReye already does

These endurance optimizations ship on by default — no tuning required, and no functionality is
given up (live monitoring is served from memory over WebSocket, so the database is only the
history store):

- **Batched history writes.** Rows are buffered and flushed in one transaction every
  `HISTORY_FLUSH_INTERVAL_MS` (default 5 s) instead of one INSERT per poll, collapsing
  commit/fsync/WAL churn ~5×. A crash loses at most that window of history — never live data,
  never corruption.
- **Tuned Postgres** in every bundled database — the Docker Compose TimescaleDB containers *and*
  the Home Assistant addon's embedded PostgreSQL: `synchronous_commit=off` (group-commit, bounded
  <~0.5 s crash-loss window), `wal_compression=on`, and wider checkpoint spacing
  (`max_wal_size=2GB`, `checkpoint_timeout=30min`) to cut full-page-write churn.

Net effect, per inverter:

| | Untuned baseline | With defaults |
| --- | --- | --- |
| DB commits / disk flushes | ~86,400 / day (1/s) | **~17,000 / day** (1 per 5 s) |
| Physical writes (TBW) | ~20–45 GB/day (~10–15 TB/yr) | **~8–20 GB/day (~3–7 TB/yr)** |

Batching alone drops commits and fsyncs ~5× (measured: one transaction per ~5 s of samples, not
one per poll); the Postgres tuning then shrinks WAL and full-page-write volume on top. Together
they cut bytes written **roughly 2–3×** below the untuned baseline. On a real SSD that stretches
an already-comfortable decade-plus lifespan into several decades — but the bigger practical wins
are far fewer flash program/erase cycles and lower I/O load, which matter most on the constrained
hardware (Pi-class devices) the Home Assistant addon typically runs on. Figures are approximate
and deployment-dependent — actual write amplification varies with Postgres config and the drive.

To reduce writes further, lower the poll rate (`POLL_INTERVAL_MS`) — the single biggest lever.
If you point at your **own** PostgreSQL via `DATABASE_URL`, apply the same Postgres settings
there; the batching happens in the app and applies regardless.

## Ports

| Port | Service |
| --- | --- |
| `5173` | Web dashboard (dev) |
| `3000` | Core engine / API |
| `5432` | PostgreSQL / TimescaleDB |
| `3001` | Web dashboard (Docker Compose deployment) |

## Two ways to install

- **[Manual setup](/deploy/manual-setup/)** — run the dev servers directly with bun.
  Best for development and profile authoring.
- **[Docker Compose](/deploy/docker/)** — build and run web + server as containers.
  Best for a persistent self-hosted install.
