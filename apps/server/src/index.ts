import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { elysiaLogger } from "@logtape/elysia";
import { auth } from "@SunReye/auth";
import { db } from "@SunReye/db";
import { metricsRaw } from "@SunReye/db/schema/metrics";
import { user } from "@SunReye/db/schema/auth";
import { env } from "@SunReye/env/server";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { type CostBucket, computeCost, computeCostSeries, resolveRange } from "./cost";
import { energySeries } from "./energy";
import { entitiesApi } from "./entities";
import { queryRollup } from "./history";
import { buildProfileContext, initProfiles } from "./inverter";
import { log, setupLogging } from "./logging";
import { adminRoutes } from "./routes/admin";
import { adminGuard } from "./routes/admin-guard";
import { profileRoutes } from "./routes/profiles";
import { settingsRoutes } from "./routes/settings";
import * as runtime from "./runtime";

// Shared query for the per-period series endpoints (cost + energy): an explicit
// [from, to) window at a chosen bucket, plus an optional inverter override.
const seriesQuery = t.Object({
  from: t.String(),
  to: t.String(),
  bucket: t.Union([t.Literal("hour"), t.Literal("day"), t.Literal("month")]),
  inverterId: t.Optional(t.String()),
});
const seriesArgs = (q: { from: string; to: string; bucket: CostBucket; inverterId?: string }) => ({
  from: new Date(q.from),
  to: new Date(q.to),
  bucket: q.bucket,
  inverterId: q.inverterId,
});

// Wire LogTape before anything logs (Elysia's request logger and the app
// loggers below both flow through the sinks configured here).
await setupLogging();
const serverLog = log();

/**
 * Coax a human-readable message out of whatever a failed Modbus write threw.
 * modbus-serial rejects with Error subclasses and sometimes plain objects, so
 * `String(err)` alone can collapse to "[object Object]" and hide the cause. Pull
 * `message` directly (it reads even when non-enumerable) and append the modbus
 * exception code when present.
 */
function describeWriteError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as { message?: unknown; modbusCode?: unknown };
  const detail = e.modbusCode === undefined ? "" : ` (modbusCode=${e.modbusCode})`;
  return `${String(e.message)}${detail}`;
}

// Two-phase profile boot: built-in packages self-register on import, then DB
// profiles are loaded and the active one resolved. Everything the transports
// need (manifest, catalog, write validation) is derived once here and injected,
// since the active profile is a boot concern (changing it requires a restart).
const profile = await initProfiles();
const ctx = buildProfileContext(profile);
const { manifest } = ctx;

// Live sample: arbitrary metric keys → numeric values, defined by the profile.
const SampleSchema = t.Object({
  time: t.String(),
  inverterId: t.String(),
  metrics: t.Record(t.String(), t.Number()),
});

const METRICS_TOPIC = "metrics";

const app = new Elysia()
  // Structured HTTP request logging (category ["elysia"]). Health/liveness
  // probes are noisy and uninteresting, so skip them.
  .use(elysiaLogger({ skip: (ctx) => ctx.path === "/" }))
  .use(
    cors({
      // In dev the web app may be served on any localhost port (Vite fallback,
      // VS Code port forwarding), so reflect any localhost origin. Production
      // pins to the configured origin.
      origin:
        env.NODE_ENV === "production"
          ? env.CORS_ORIGIN
          : [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, env.CORS_ORIGIN],
      methods: ["GET", "POST", "PUT", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )
  // Browsable docs (Scalar UI at /openapi, spec at /openapi/json) for the
  // auto-generated third-party API. Tags group the generated entity/command ops.
  .use(
    openapi({
      // Entity keys are dotted (e.g. `settings.battery.grid_charge`) and appear
      // in the generated write-route paths. Without this the plugin treats any
      // path containing "." as a static file and omits every command route.
      exclude: { staticFile: false },
      documentation: {
        info: {
          title: "SunReye Inverter API",
          version: "1.0.0",
          description:
            "Third-party integration API. Every entity and command is generated from the active inverter profile.",
        },
        tags: [
          { name: "Entities", description: "Read inverter entities and their history." },
          { name: "Commands", description: "Write validated settings to the inverter." },
        ],
      },
    }),
  )
  // Auto-generated `/api/v1` integration surface (entity catalog, state,
  // history, and one validated write route per writable entity). Writes go
  // through the runtime controller's live source.
  .use(entitiesApi({ ctx, write: runtime.write }))
  // Admin gate for privileged mutations — see ./routes/admin-guard.
  .use(adminGuard)
  // Hand the raw request to Better Auth. `parse: "none"` stops Elysia from
  // consuming the request body — other routes in this app define body schemas,
  // which turns on body parsing app-wide, and a parsed (consumed) stream makes
  // Better Auth's own body read throw `ERR_BODY_ALREADY_USED`. This is the same
  // technique Elysia's own `.mount()` uses to forward to a sub-handler.
  .all(
    "/api/auth/*",
    async (context) => {
      const { request, status } = context;
      if (["POST", "GET"].includes(request.method)) {
        return auth.handler(request);
      }
      return status(405);
    },
    { parse: "none" },
  )
  .get("/", () => "OK")
  // First-run gate for the web app: true until the instance has its first
  // (admin) account. Public — the onboarding flow can't be authenticated yet.
  .get("/api/setup-status", async () => {
    const [row] = await db.select({ n: count() }).from(user);
    return { needsSetup: (row?.n ?? 0) === 0 };
  })
  // Capability manifest for the active inverter profile: capabilities + a
  // render-ready metric catalog (role, kind, range, enum labels, flow). The UI
  // builds itself from this — no per-inverter code.
  .get("/api/profile", () => manifest)
  // Live metrics stream: clients subscribe to the shared topic; the God-loop
  // publishes every sample via `app.server.publish(METRICS_TOPIC, ...)`.
  .ws("/ws/metrics", {
    response: SampleSchema,
    open(ws) {
      ws.subscribe(METRICS_TOPIC);
    },
  })
  // Historical data (long form). Filter by metric / inverter; rollups live in
  // TimescaleDB continuous aggregates, this reads the raw hypertable. Capped to
  // the raw retention window (30 days) so it never queries dropped chunks —
  // longer spans must go through /api/history/rollup.
  .get(
    "/api/history",
    async ({ query }) => {
      const since = new Date(Date.now() - query.hours * 60 * 60 * 1000);
      const filters = [gte(metricsRaw.time, since)];
      if (query.metric) filters.push(eq(metricsRaw.metric, query.metric));
      if (query.inverterId) filters.push(eq(metricsRaw.inverterId, query.inverterId));
      return db
        .select()
        .from(metricsRaw)
        .where(and(...filters))
        .orderBy(desc(metricsRaw.time))
        .limit(query.limit);
    },
    {
      query: t.Object({
        hours: t.Number({ default: 24, minimum: 1, maximum: 720 }),
        limit: t.Number({ default: 5000, minimum: 1, maximum: 50000 }),
        metric: t.Optional(t.String()),
        inverterId: t.Optional(t.String()),
      }),
    },
  )
  // Recent raw samples across all metrics, ascending — used to backfill the
  // client's in-memory live buffers so sparklines are populated immediately on
  // page load instead of rebuilding over several minutes.
  .get(
    "/api/history/recent",
    async ({ query }) => {
      const since = new Date(Date.now() - query.seconds * 1000);
      const inverterId = query.inverterId ?? profile.id;
      // Most-recent-first so a capped result keeps the latest samples (the
      // client sorts ascending per metric).
      const rows = await db
        .select()
        .from(metricsRaw)
        .where(and(gte(metricsRaw.time, since), eq(metricsRaw.inverterId, inverterId)))
        .orderBy(desc(metricsRaw.time))
        .limit(query.limit);
      return rows.map((r) => ({ time: r.time.toISOString(), metric: r.metric, value: r.value }));
    },
    {
      query: t.Object({
        seconds: t.Number({ default: 300, minimum: 1, maximum: 3600 }),
        inverterId: t.Optional(t.String()),
        limit: t.Number({ default: 50000, minimum: 1, maximum: 200000 }),
      }),
    },
  )
  // Downsampled history for charts. Reads TimescaleDB continuous aggregates
  // (`hourly_rollups` / `daily_rollups`) — pre-computed avg/max/min per
  // (inverter, metric) bucket — so a multi-week chart stays cheap. Returns
  // ascending time order (what charts expect). The views are created/refreshed
  // by raw SQL in packages/db (timescale.sql), so they're queried via `sql`
  // rather than a drizzle table.
  .get(
    "/api/history/rollup",
    async ({ query }) => {
      // Explicit [from, to) window (custom date-range picker) takes precedence;
      // otherwise fall back to the open-ended hours-ago offset.
      const window =
        query.from && query.to
          ? { from: new Date(query.from), to: new Date(query.to) }
          : { since: new Date(Date.now() - (query.hours ?? 168) * 60 * 60 * 1000) };
      return queryRollup({
        metric: query.metric,
        inverterId: query.inverterId ?? profile.id,
        limit: query.limit,
        bucket: query.bucket ?? "hour",
        ...window,
      });
    },
    {
      query: t.Object({
        metric: t.String(),
        inverterId: t.Optional(t.String()),
        bucket: t.Optional(t.Union([t.Literal("minute"), t.Literal("hour"), t.Literal("day")])),
        hours: t.Optional(t.Number({ minimum: 1 })),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        limit: t.Number({ default: 5000, minimum: 1, maximum: 50000 }),
      }),
    },
  )
  // Internal write pipeline for the (session-authed) web app. Validates the key
  // and value against the entity's metadata before touching the inverter — the
  // external `/api/v1` surface enforces the same rules via generated schemas.
  .post(
    "/api/commands/setting",
    async ({ body, status }) => {
      const error = ctx.validateWrite(body.key, body.value);
      if (error) return status(400, { error });
      try {
        await runtime.write(body.key, body.value);
      } catch (err) {
        // The inverter didn't accept/answer the write (e.g. Modbus timeout or
        // exception response). Log the real cause and surface it as a gateway
        // error rather than a bare 500.
        const message = describeWriteError(err);
        serverLog.error("setting write failed key={key} value={value}: {message}", {
          key: body.key,
          value: body.value,
          message,
        });
        return status(502, { error: message });
      }
      return { ok: true, key: body.key, value: body.value };
    },
    { requireAdmin: true, body: t.Object({ key: t.String(), value: t.Number() }) },
  )
  // Runtime configuration (tariff, inverter, MQTT) + connection status.
  .use(settingsRoutes)
  // Cost breakdown over a named range (today / month-to-date / year-to-date) or
  // an explicit [from, to) window. Prices stored energy with the active tariff.
  .get(
    "/api/cost",
    ({ query }) => {
      const { from, to } =
        query.from && query.to
          ? { from: new Date(query.from), to: new Date(query.to) }
          : resolveRange(query.range ?? "month");
      return computeCost(profile, { from, to, inverterId: query.inverterId });
    },
    {
      query: t.Object({
        range: t.Optional(t.Union([t.Literal("today"), t.Literal("month"), t.Literal("year")])),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        inverterId: t.Optional(t.String()),
      }),
    },
  )
  // Net-cost time-series over an explicit [from, to) window, one point per
  // `bucket` (hour / day / month). Feeds the Costs page's range-driven bar chart;
  // band-accurate and cheap (delta + rollup done in SQL, bounded matrix returned).
  .get("/api/cost/series", ({ query }) => computeCostSeries(profile, seriesArgs(query)), {
    query: seriesQuery,
  })
  // Per-period energy split (grid-vs-solar consumption, self-consumed-vs-exported
  // production) over the same window/bucket. Feeds the Costs page energy chart;
  // derived at query time from the rollups, zero-filled so the x-axis stays stable.
  .get("/api/energy/series", ({ query }) => energySeries(profile, seriesArgs(query)), {
    query: seriesQuery,
  })
  // Profile management: registered list, repo sources, browse/install/activate.
  .use(profileRoutes)
  // Admin-only maintenance: data reset + API-key administration.
  .use(adminRoutes)
  .listen(env.PORT, () => {
    serverLog.info("server running on http://localhost:{port} — profile {profile}", {
      port: env.PORT,
      profile: profile.id,
    });
  });

// Start the runtime controller: it owns the poll loop, the live source, and the
// MQTT bridge (all hot-reconfigurable). Each sample is broadcast to WebSocket
// subscribers here; persistence + MQTT publishing happen inside the controller.
runtime.start((sample) => {
  app.server?.publish(METRICS_TOPIC, JSON.stringify(sample));
}, ctx);

// Graceful shutdown: stop polling and release the transport + broker.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await runtime.stop();
    process.exit(0);
  });
}

export type App = typeof app;
