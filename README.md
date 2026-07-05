# SunReye

**A self-hosted monitoring, control, and integration platform for solar / hybrid inverters.**

SunReye polls your inverter over Modbus, stores every reading as time-series data, and gives you a live dashboard, a typed REST API, and an MQTT bridge with Home Assistant auto-discovery — all generated from a single description of the inverter.

The core idea: **an inverter is data, not code.** Each supported inverter ships as a *profile* — a plain description of its Modbus register map plus semantic metadata (what each value *means*: PV string power, battery SoC, a writable charge-current setting, an enum status…). The dashboard, the REST routes, the MQTT topics, and Home Assistant discovery all build themselves from that profile. Adding a metric, or supporting a whole new inverter, means adding data — not touching the engine.

---

## What it does today

- **Live monitoring** — 1 Hz polling of the inverter, streamed to the browser over WebSocket. Manifest-driven dashboard that renders itself from the active inverter's capabilities (PV strings, battery, grid phases, generator, backup load) with animated KPIs and live sparklines.
- **History & analytics** — every sample persisted to **TimescaleDB**; per-minute / hourly / daily continuous-aggregate rollups make multi-week charts cheap. Automatic retention cleanup of raw metrics and rollups.
- **Control** — writable settings (charge/discharge currents, work mode, grid charge, solar-sell…) exposed as validated controls in the UI, guarded by the same validation everywhere.
- **Third-party REST API (`/api/v1`)** — an auto-generated integration surface: entity catalog, current state, per-entity history, and one *validated* write route per writable entity, with OpenAPI docs. API-key authenticated (fails closed in production).
- **MQTT bridge** — publishes every entity to retained `<prefix>/<inverterId>/<topic>` topics, accepts writes on `.../set`, and optionally publishes **Home Assistant MQTT Discovery** configs so SunReye auto-populates in Home Assistant (select / number / sensor entities, availability via LWT).
- **Built-in simulator** — run the whole stack with a coherent fake inverter (no hardware needed) for development and demos.
- **Auth** — email/password sessions via Better-Auth.

**Supported inverters:** Deye / Sunsynk hybrid (≈99 metrics, ≈38 writable). More profiles planned — see the roadmap.

---

## Architecture

```
Inverter (Modbus TCP)  ──►  Core engine (Elysia)  ──►  TimescaleDB (time-series)
        │                        │  ├─ WebSocket  ──►  Web dashboard (SvelteKit)
        │                        │  ├─ REST /api/v1 ──►  Third-party integrations
        └── (or simulator)       │  └─ MQTT bridge  ──►  Home Assistant / brokers
                                 ▲
                    Inverter profile (data)
             register map + semantic metadata  ──►  drives every surface above
```

- **`packages/inverter-core`** — the engine: Modbus codec/driver, the profile registry (the seam that lets new inverters be "installed" as packages), capability derivation, and transport-neutral entity descriptors (constraints, bounds, enums) that every transport generates from.
- **`packages/inverter-deye-sunsynk`** — a profile package. Self-registers on import.
- **`apps/server`** — the core engine (Elysia + Bun): the poll loop, WebSocket stream, REST API, MQTT bridge, history endpoints.
- **`apps/web`** — the SvelteKit dashboard. Builds itself from the profile manifest.
- **`packages/db`** — Drizzle schema + TimescaleDB setup. Metrics are stored in *narrow* form (one row per metric per tick), so a new inverter needs **no migration**.
- **`packages/env` / `packages/auth` / `packages/config`** — shared config, auth, and tooling.

**Stack:** TypeScript · Bun · Turborepo · SvelteKit 5 + Tailwind v4 · Elysia · Drizzle + PostgreSQL/TimescaleDB · Better-Auth · MQTT.

---

## Vision & roadmap

The mission stays fixed: **a self-hosted, profile-driven platform for monitoring, controlling, and integrating hybrid inverters — where new hardware and new capabilities are added as data and configuration, not forks of the engine.** Every item below expands capability or UX along that line; anything that would turn SunReye into a general-purpose home-automation hub or diverge from inverters is explicitly out of scope.

### Phase 1 — Economics: cost tracking & tariffs
Turn energy flows into money — the feature most owners actually care about.
- **Tariff model:** import price per kWh (flat + time-of-use bands), monthly standing charge, currency.
- **Feed-in / export tariff:** per-kWh export rate (flat or banded) for solar sell-back.
- **Cost dashboard:** daily / monthly grid cost, export earnings, net bill, and **savings vs. grid-only** (self-consumption × import price).
- **Self-sufficiency & self-consumption %**, CO₂ avoided, and simple payback/ROI tracking.
- Reuses the existing energy rollups — this is analysis on data already stored, no new polling.

### Phase 2 — Configuration in the UI
Everything that's env-only today becomes a first-class, DB-backed settings screen.
- **Inverter setup:** connection (host / port / unit id / timeout), poll interval, active profile, simulate toggle — editable and testable ("Test connection") from the UI.
- **MQTT & Home Assistant:** broker URL, credentials, topic prefix, and HA discovery toggle configurable at runtime, with a live connection status indicator.
- **Tariff & currency settings** (feeds Phase 1).
- No more `.env` edits or restarts to reconfigure a deployment.

### Phase 3 — Downloadable inverter packages
The profile registry already makes inverters pluggable in code; this exposes it to users.
- **Profile catalog in the UI:** browse, install, and enable inverter profiles without redeploying.
- **Distribute profiles as standalone packages** (`@SunReye/inverter-*`), versioned independently, so support for new inverters grows over time — including community-contributed profiles.
- **Multi-inverter support:** run and aggregate several inverters / profiles at once; the narrow metrics schema and `inverterId` dimension already accommodate this.
- Goal: **monitor any Modbus inverter by installing a profile — never by patching the engine.**

### Phase 4 — Alerts, reports & automation
- **Threshold alerts & notifications:** low battery SoC, grid outage, fault/alarm status, offline inverter — delivered via push, email, webhook, or MQTT.
- **Scheduled reports & CSV/data export:** daily/monthly energy + cost summaries.
- **Tariff-aware automation (later):** schedule battery charge/discharge and grid-charge windows around time-of-use tariffs and solar production — writing settings through the control path that already exists.

### Cross-cutting / UX
- Documentation site (`apps/docs`) fleshed out: profile authoring guide, API reference, integration how-tos.
- Mobile-friendly dashboard polish and installable PWA.
- Multi-user / role support (view-only vs. control).

---

## Getting started

Install dependencies:

```bash
bun install
```

### Dev Container (recommended)

Open the repo in VS Code and **Reopen in Container** (`.devcontainer/`). This automatically:

- starts a **TimescaleDB** service on the compose network,
- installs dependencies (`bun install`),
- creates the schema and TimescaleDB hypertable/aggregates (`bun db:push && bun db:timescale`).

Then start everything:

```bash
bun run dev
```

Both services use **host networking** (required for Docker inside an unprivileged Proxmox LXC), so the app reaches the DB on `localhost:5432`. `DATABASE_URL` is passed through Turborepo, so no `.env` edits are needed inside the container. Ports 3000 (core engine), 5173 (web), and 5432 (db) are exposed on the host.

### Manual setup

1. Provision a PostgreSQL/TimescaleDB database (`bun run db:start` runs one via Docker Compose).
2. Set connection details in `apps/server/.env`.
3. Apply the schema and TimescaleDB objects:

   ```bash
   bun run db:push
   bun run db:timescale
   ```

4. Start the dev servers:

   ```bash
   bun run dev
   ```

Open [http://localhost:5173](http://localhost:5173) for the dashboard; the API is at [http://localhost:3000](http://localhost:3000) (OpenAPI docs at `/openapi`).

> **No inverter?** Set `INVERTER_SIMULATE=true` (the default) to run against the built-in simulator.

### Key environment variables (`apps/server/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL/TimescaleDB connection |
| `INVERTER_PROFILE` | Active profile id (e.g. `deye-sunsynk`) |
| `INVERTER_SIMULATE` | `true` to use the simulator instead of real Modbus |
| `INVERTER_HOST` / `INVERTER_PORT` / `INVERTER_UNIT_ID` | Modbus TCP target |
| `POLL_INTERVAL_MS` | Poll cadence (default 1000) |
| `API_KEYS` | Comma-separated keys for `/api/v1` (empty = open in dev, closed in prod) |
| `MQTT_ENABLED` + `MQTT_BROKER_URL` / `MQTT_TOPIC_PREFIX` / `MQTT_USERNAME` / `MQTT_PASSWORD` | MQTT bridge |
| `HA_DISCOVERY_ENABLED` + `HA_DISCOVERY_PREFIX` | Home Assistant MQTT Discovery |

*(These move into the UI in Phase 2 of the roadmap.)*

---

## Deployment

**Docker Compose** builds and runs web + server (Dockerfiles in `apps/*/Dockerfile`):

```bash
bun run docker:build   # build images
bun run docker:up      # build & start
bun run docker:logs    # tail logs
bun run docker:down    # stop
```

Environment variables are read from each app's `.env` (public web vars are baked at build) and overridden in `docker-compose.yml` for container networking.

---

## Project structure

```
SunReye/
├── apps/
│   ├── web/         # SvelteKit dashboard (manifest-driven UI)
│   ├── server/      # Elysia core engine: poll loop, WS, REST /api/v1, MQTT bridge
│   └── docs/        # Astro Starlight documentation site
└── packages/
    ├── inverter-core/         # Modbus engine, profile registry, entity model
    ├── inverter-deye-sunsynk/ # Deye / Sunsynk profile package
    ├── db/                    # Drizzle schema + TimescaleDB setup
    ├── auth/                  # Better-Auth configuration
    ├── env/                   # Env schema/validation (single source of truth)
    └── config/                # Shared tooling config
```

---

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Start all apps + DB in dev mode |
| `bun run dev:web` / `bun run dev:server` | Start a single app |
| `bun run build` | Build all apps |
| `bun run check-types` | TypeScript type-check across the monorepo |
| `bun run check` | Oxlint + Oxfmt |
| `bun run db:push` | Push schema to the database |
| `bun run db:timescale` | Create TimescaleDB hypertable + aggregates |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run db:start` / `db:watch` / `db:stop` / `db:down` | Manage the local TimescaleDB container |
| `bun run docker:build` / `docker:up` / `docker:logs` / `docker:down` | Docker Compose deployment |
| `bun run prepare` | Initialize Git hooks (Husky) |

---

*Bootstrapped with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).*
