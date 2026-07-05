---
title: Environment Variables
description: Every environment variable SunReye reads, with defaults and where they apply.
---

All environment variables are declared and validated in a single place — `packages/env`
(`server.ts` for the server, `web.ts` for the browser bundle) — using `@t3-oss/env-core`
+ Zod at import time. No other package parses `process.env` directly.

:::note[Only five are truly required]
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `CORS_ORIGIN` (server) plus
`PUBLIC_SERVER_URL` (web) are the only variables without a default. Everything else is
optional.
:::

## Runtime config has moved into the UI

Much of what used to be env-only is now **DB-backed runtime configuration** editable from
the [Settings](/use/settings/) screen (no restart, no redeploy). For those variables the
env value is used **only as a seed** the first time the server boots with no saved setting;
once you save that setting from the UI, the env var is ignored.

Variables below are marked:

- **env-only** — always read from the environment.
- **seed only** — seeds a DB setting on first boot, then superseded by
  [Settings](/use/settings/).

## Core / infrastructure

| Variable | Type | Default | Required | Purpose |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | string | — | ✅ | PostgreSQL / TimescaleDB connection string. |
| `NODE_ENV` | `development` \| `production` \| `test` | `development` | | Runtime environment. |
| `PORT` | number | `3000` | | HTTP port the core engine listens on. |
| `LOG_LEVEL` | `trace` … `fatal` | `debug` (dev) / `info` | | Lowest LogTape severity written to the console. |

## Auth

| Variable | Type | Default | Required | Purpose |
| --- | --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | string (≥32) | — | ✅ | Better Auth signing secret. |
| `BETTER_AUTH_URL` | url | — | ✅ | Better Auth base URL. |
| `CORS_ORIGIN` | url | — | ✅ | Allowed CORS origin (the dashboard's URL). |

## Inverter / Modbus connection

| Variable | Type | Default | Status | Purpose |
| --- | --- | --- | --- | --- |
| `INVERTER_PROFILE` | string | `deye-sunsynk` | seed only | Active profile id. Seeds the `activeProfile` setting; changing the active profile takes effect on restart. |
| `INVERTER_HOST` | string | `192.168.1.100` | seed only | Modbus TCP host. |
| `INVERTER_PORT` | number | `502` | seed only | Modbus TCP port. |
| `INVERTER_UNIT_ID` | number | `1` | seed only | Modbus unit / slave id. |
| `INVERTER_SIMULATE` | boolean | `true` | **env-only** | Generate synthetic telemetry instead of reading real hardware. Deliberately deploy-level, not in DB config. |
| `POLL_INTERVAL_MS` | number | `1000` | seed only | Poll cadence in ms (floored at 1000). |

Two connection fields are DB-only (no env seed): **transport** (`tcp` / `rtu-over-tcp`) and
**timeout** (default 2000 ms). Set them from [Settings → Inverter](/use/settings/).

## Integration API

| Variable | Type | Default | Status | Purpose |
| --- | --- | --- | --- | --- |
| `API_KEYS` | comma-separated string | `""` (none) | env-only | Static keys accepted by the public [`/api/v1`](/integrations/rest-api/) surface, **in addition to** admin-managed keys (Settings → API Keys). Empty = open in dev, **fails closed in production**. |

## MQTT bridge

| Variable | Type | Default | Status | Purpose |
| --- | --- | --- | --- | --- |
| `MQTT_ENABLED` | boolean | `false` | seed only | Enable the MQTT bridge. |
| `MQTT_BROKER_URL` | string | `mqtt://localhost:1883` | seed only | Broker URL. |
| `MQTT_TOPIC_PREFIX` | string | `sunreye` | seed only | Root topic segment: `<prefix>/<inverterId>/<topic>`. |
| `MQTT_USERNAME` | string | — | seed only | Broker username. |
| `MQTT_PASSWORD` | string | — | seed only | Broker password (the DB copy is write-only / masked). |

## Home Assistant discovery

| Variable | Type | Default | Status | Purpose |
| --- | --- | --- | --- | --- |
| `HA_DISCOVERY_ENABLED` | boolean | `false` | seed only | Publish [Home Assistant](/integrations/home-assistant/) MQTT Discovery configs (requires MQTT enabled). |
| `HA_DISCOVERY_PREFIX` | string | `homeassistant` | seed only | HA discovery topic prefix. |

## Web (browser bundle)

| Variable | Type | Default | Required | Purpose |
| --- | --- | --- | --- | --- |
| `PUBLIC_SERVER_URL` | url | — | ✅ | Server base URL exposed to the browser. Baked at build time for Docker deployments. |

## Meta

| Variable | Purpose |
| --- | --- |
| `SKIP_ENV_VALIDATION` | If set (truthy), bypasses all env schema validation at import. Useful in CI/build steps. |

## Config with no env var (UI-only)

Some domains are configured entirely from the UI, with defaults from their schema — no env
var exists:

- **Tariff** — currency, standing charge, import bands, feed-in rate. See
  [Costs & Tariffs](/use/costs/).
- **Profile sources** — the list of git repos to browse for downloadable profiles. See
  [Distributing Profiles](/profiles/distribution/).

:::caution[Boolean values]
Boolean env vars are parsed from the literal strings `"true"` / `"false"`.
:::
