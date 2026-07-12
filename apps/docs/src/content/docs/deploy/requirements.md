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
