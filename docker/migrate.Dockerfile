# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# One-shot schema initializer.
#
# Applies the drizzle schema (`db:push`) and the TimescaleDB DDL that drizzle
# cannot express — hypertable, continuous aggregates, compression + retention
# policies (`db:timescale`) — against DATABASE_URL, then exits.
#
# Both steps are idempotent: `db:push` is a no-op when the schema already
# matches, and `timescale.sql` is entirely `IF NOT EXISTS` / remove+add. So this
# runs safely on every `docker compose up` and doubles as the upgrade path when
# a new release adds tables (e.g. the `apikey` table).
#
# Unlike the distroless server image, this needs the full bun toolchain,
# drizzle-kit, and the schema TS files — hence a separate, run-once image.
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1
WORKDIR /app
ENV HUSKY=0 SKIP_ENV_VALIDATION=1 NODE_ENV=production

COPY . .
# Default (non --production) install so drizzle-kit (a devDependency) is present.
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

WORKDIR /app/packages/db
ENTRYPOINT ["sh", "-c", "bun run db:push && bun run db:timescale"]
