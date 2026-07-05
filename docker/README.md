# SunReye — deploy from published images

Runs SunReye using the container images built and pushed to GHCR by the CI
pipelines. No source checkout or local build required — just Docker.

Images:

- `ghcr.io/ediiiz/sunreye-server` — core engine / API (Elysia, ~60 MB)
- `ghcr.io/ediiiz/sunreye-web` — SvelteKit dashboard (~130 MB)
- `ghcr.io/ediiiz/sunreye-migrate` — run-once schema initializer (bun + drizzle-kit)

All are multi-arch (`linux/amd64`, `linux/arm64`).

## Quick start

```bash
cp .env.example .env
# edit .env — at minimum set BETTER_AUTH_SECRET and POSTGRES_PASSWORD
docker compose up -d
```

- Dashboard → http://localhost:3001
- API + OpenAPI docs → http://localhost:3000

Defaults to a simulated inverter (`INVERTER_SIMULATE=true`), so it runs with no
hardware. Point it at a real inverter by setting `INVERTER_SIMULATE=false` and
the `INVERTER_HOST` / `INVERTER_PORT` / `INVERTER_UNIT_ID` values.

## Pinning a version

`SUNREYE_TAG` selects the image tag (default `latest`):

```bash
SUNREYE_TAG=v1.2.3 docker compose up -d
```

## Database schema

Handled automatically. A one-shot **`migrate`** service
(`ghcr.io/ediiiz/sunreye-migrate`) applies the schema (`db:push`) and the
TimescaleDB objects (`db:timescale`) against the empty database, and the
`server` waits for it to finish (`service_completed_successfully`) before
starting. No repo checkout or manual `db:push` needed.

It is idempotent — it re-runs on every `docker compose up` and is a no-op when
the schema already matches, so it also applies new tables when you bump
`SUNREYE_TAG` to a newer release. Data persists in the `sunreye_pg` volume
across restarts.

> Destructive schema changes (dropping a column/table) can make `db:push`
> prompt interactively, which will hang the non-TTY migrate container. Those are
> rare on upgrades (releases add, not remove); if you hit one, run `db:push`
> manually from a checkout and review the change.

## Notes

- **`PUBLIC_SERVER_URL` is baked into the web image at build time.** It can't be
  changed in this compose file. Set the `PUBLIC_SERVER_URL` repository variable
  before the `docker-web` pipeline runs so the built image points at the URL your
  browser will reach the server on.
- The server image is distroless (no shell/curl), so there is no in-container
  healthcheck. Dependents use `service_started`; add a TCP/HTTP probe at your
  orchestrator/reverse-proxy layer in production.
- Pulling private GHCR packages requires `docker login ghcr.io` first. If the
  packages are public, no login is needed.
