---
title: Docker Compose
description: Build and run the SunReye web + server + database with Docker Compose.
---

The root `docker-compose.yml` builds and runs the full stack: the **web** dashboard, the
**server** (core engine), and a **TimescaleDB** database. The app Dockerfiles live at
`apps/web/Dockerfile` and `apps/server/Dockerfile`.

## Commands

```bash
bun run docker:build   # build images
bun run docker:up      # build & start (detached)
bun run docker:logs    # tail logs
bun run docker:down    # stop
```

## Services and ports

| Service | Image / build | Host port |
| --- | --- | --- |
| `web` | `apps/web/Dockerfile` | `3001` |
| `server` | `apps/server/Dockerfile` | `3000` |
| `postgres` | `timescale/timescaledb:latest-pg17` | `5432` |

The dashboard is served on **[http://localhost:3001](http://localhost:3001)** and the API
on **[http://localhost:3000](http://localhost:3000)**.

## Configuration

- Each app reads its own `.env` (`apps/web/.env`, `apps/server/.env`), which are optional in
  Compose (`required: false`).
- `docker-compose.yml` overrides a few values for container networking:
  - `server` gets `CORS_ORIGIN=http://localhost:3001` and a `DATABASE_URL` pointing at the
    `postgres` service.
  - Set `POSTGRES_PASSWORD` in your environment to override the default (`password`).
- **Public web variables are baked at build time.** `PUBLIC_SERVER_URL` is passed as a
  build arg (`http://localhost:3000` by default) — change it in `docker-compose.yml` if the
  browser reaches the API at a different URL, and rebuild.

See the [Environment Variables](/reference/environment/) reference for every value.

## Notes

- **The server image is distroless** — no shell, node, or curl inside. There is no in-container
  binary for an exec healthcheck, so dependents use `service_started`. In production, add an
  orchestrator-level TCP/HTTP probe against port `3000`.
- The `postgres` service has a `pg_isready` healthcheck and the server waits for it
  (`service_healthy`) before starting.
- Database data persists in the `SunReye_postgres_data` volume.

## Schema initialization

The database schema and TimescaleDB objects still need to be created against the running
database (the same `db:push` / `db:timescale` steps as [manual setup](/deploy/manual-setup/)),
pointed at the Compose Postgres via `DATABASE_URL`.
