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
(`ghcr.io/ediiiz/sunreye-migrate`) runs the journaled migration runner against
the database, and the `server` waits for it to finish
(`service_completed_successfully`) before starting. No repo checkout or manual
step needed.

It re-runs safely on every `docker compose up` (applied migrations are skipped
via the journal), so bumping `SUNREYE_TAG` to a newer release brings the schema
forward automatically. Databases created by older releases (the pre-journal
`db:push` era) are baselined in place on the first run. The runner refuses to
run an older release against a database migrated by a newer one — restore a
backup to downgrade. A failed migration exits non-zero with the cause in
`docker compose logs migrate`, and the server never starts. Data persists in
the `sunreye_pg` volume across restarts.

## Notes

- **`PUBLIC_SERVER_URL` is read at runtime** (container start). It tells the
  browser where to reach the API; override it in `.env` or the environment when
  that isn't `http://localhost:3000`.
- The server image is distroless (no shell/curl), so there is no in-container
  healthcheck. Dependents use `service_started`; add a TCP/HTTP probe at your
  orchestrator/reverse-proxy layer in production.
- Pulling private GHCR packages requires `docker login ghcr.io` first. If the
  packages are public, no login is needed.
