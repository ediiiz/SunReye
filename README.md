# SunReye

[![CI](https://github.com/ediiiz/SunReye/actions/workflows/ci.yml/badge.svg)](https://github.com/ediiiz/SunReye/actions/workflows/ci.yml)
[![Docs](https://github.com/ediiiz/SunReye/actions/workflows/docs.yml/badge.svg)](https://github.com/ediiiz/SunReye/actions/workflows/docs.yml)
[![coverage](https://raw.githubusercontent.com/ediiiz/SunReye/badges/coverage.svg)](https://github.com/ediiiz/SunReye/actions/workflows/ci.yml)
[![code style: oxlint + oxfmt](https://img.shields.io/badge/code%20style-oxlint%20%C2%B7%20oxfmt-6E40C9)](https://oxc.rs/)
[![code health: fallow](https://img.shields.io/badge/code%20health-fallow-3FB950)](https://fallow.tools/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-5-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev/)

**A self-hosted monitoring, control, and integration platform for solar / hybrid inverters.**

SunReye polls your inverter over Modbus, stores every reading as time-series data, and gives
you a live dashboard, a typed REST API, and an MQTT bridge with Home Assistant
auto-discovery — all generated from a single description of the inverter.

The core idea: **an inverter is data, not code.** Each supported inverter ships as a
*profile* — a plain description of its Modbus register map plus semantic metadata (what each
value *means*). The dashboard, the REST routes, the MQTT topics, and Home Assistant discovery
all build themselves from that profile. Adding a metric, or a whole new inverter, means
adding data — not touching the engine.

> 📖 **Full documentation lives in the docs site** (`apps/docs`) — installation, usage, the
> REST API, MQTT/Home-Assistant, and the profile-authoring guide. Run it with
> `cd apps/docs && bun dev`.

---

## What it does today

- **Live monitoring** — 1 Hz Modbus polling streamed to the browser over WebSocket; a
  manifest-driven dashboard that renders itself from the active inverter's capabilities.
- **History & analytics** — every sample in **TimescaleDB**, with per-minute / hourly / daily
  rollups and automatic retention.
- **Control** — writable settings exposed as validated controls.
- **Costs & tariffs** — import/export tariffs, time-of-use bands, savings, self-sufficiency.
- **Third-party REST API (`/api/v1`)** — auto-generated from the profile, with OpenAPI docs.
- **MQTT bridge** — retained per-entity topics, validated writes, and Home Assistant MQTT
  Discovery.
- **Downloadable profiles** — install inverter profiles from git repos at runtime; a typed
  **profile SDK** to author your own.
- **Built-in simulator** — run the whole stack with no hardware.
- **Auth** — email/password sessions with admin roles and first-run onboarding.

**Supported inverters:** Deye / Sunsynk hybrid (≈99 metrics, ≈38 writable). Add more as data.

---

## Quick start

```bash
bun install
bun run db:start        # local TimescaleDB via Docker
bun run db:migrate      # schema migrations + hypertable/rollups
bun run dev             # start everything
```

Open [http://localhost:5173](http://localhost:5173) for the dashboard; the API + OpenAPI docs
are at [http://localhost:3000](http://localhost:3000) (`/openapi`). `INVERTER_SIMULATE`
defaults to `true`, so no inverter is needed.

See the docs for [Manual Setup](apps/docs/src/content/docs/deploy/manual-setup.md),
[Docker Compose](apps/docs/src/content/docs/deploy/docker.md), and the full
[Environment Variables](apps/docs/src/content/docs/reference/environment.md) reference.

---

## Architecture

```
Inverter (Modbus TCP)  ──►  Core engine (Elysia)  ──►  TimescaleDB (time-series)
        │                        │  ├─ WebSocket   ──►  Web dashboard (SvelteKit)
        │                        │  ├─ REST /api/v1 ──►  Third-party integrations
        └── (or simulator)       │  └─ MQTT bridge  ──►  Home Assistant / brokers
                                 ▲
                    Inverter profile (data)
             register map + semantic metadata  ──►  drives every surface above
```

```
SunReye/
├── apps/
│   ├── web/          # SvelteKit dashboard (manifest-driven UI)
│   ├── server/       # Elysia core engine: poll loop, WS, REST /api/v1, MQTT bridge
│   └── docs/         # Astro Starlight documentation site
└── packages/
    ├── inverter-core/         # Modbus engine, profile registry, entity model
    ├── inverter-deye-sg05lp3/ # Deye / Sunsynk profile package
    ├── profile-sdk/           # Profile authoring: validate / coverage / scaffold
    ├── db/                    # Drizzle schema + TimescaleDB + runtime settings
    ├── auth/ env/ config/     # Auth, env schema (single source of truth), tooling
```

**Stack:** TypeScript · Bun · Turborepo · SvelteKit 5 + Tailwind v4 · Elysia · Drizzle +
PostgreSQL/TimescaleDB · Better-Auth · MQTT.

For the boot sequence, the registry seam, and the entity model, see the
[Architecture Deep-Dive](apps/docs/src/content/docs/reference/internals.md).

---

## Roadmap

**Shipped:** cost tracking & tariffs · UI-based runtime configuration · downloadable
inverter profiles + authoring SDK · admin roles & onboarding · simulator.

**Planned:** threshold alerts & notifications · scheduled reports & data export ·
tariff-aware charge/discharge automation · multi-inverter aggregation · installable PWA ·
community profile catalog.

See the [full roadmap](apps/docs/src/content/docs/reference/roadmap.md).

---

*Bootstrapped with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).*
