import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { auth } from "@ReyeON/auth";
import { db } from "@ReyeON/db";
import { metricsRaw } from "@ReyeON/db/schema/metrics";
import { env } from "@ReyeON/env/server";
import { buildManifest } from "@ReyeON/inverter-core";
import { and, desc, eq, gte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { entitiesApi, validateWrite } from "./entities";
import { queryRollup } from "./history";
import { inverter, profile } from "./inverter";
import { startMqttBridge } from "./mqtt";
import { liveState } from "./state";

// Capability + render metadata contract; built once (profile is static).
const manifest = buildManifest(profile);

// Live sample: arbitrary metric keys → numeric values, defined by the profile.
const SampleSchema = t.Object({
  time: t.String(),
  inverterId: t.String(),
  metrics: t.Record(t.String(), t.Number()),
});

const METRICS_TOPIC = "metrics";

const app = new Elysia()
  .use(
    cors({
      // In dev the web app may be served on any localhost port (Vite fallback,
      // VS Code port forwarding), so reflect any localhost origin. Production
      // pins to the configured origin.
      origin:
        env.NODE_ENV === "production"
          ? env.CORS_ORIGIN
          : [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, env.CORS_ORIGIN],
      methods: ["GET", "POST", "OPTIONS"],
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
          title: "ReyeON Inverter API",
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
  // history, and one validated write route per writable entity).
  .use(entitiesApi())
  .all("/api/auth/*", async (context) => {
    const { request, status } = context;
    if (["POST", "GET"].includes(request.method)) {
      return auth.handler(request);
    }
    return status(405);
  })
  .get("/", () => "OK")
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
      const since = new Date(Date.now() - query.hours * 60 * 60 * 1000);
      return queryRollup({
        metric: query.metric,
        inverterId: query.inverterId ?? profile.id,
        since,
        limit: query.limit,
        bucket: query.bucket ?? "hour",
      });
    },
    {
      query: t.Object({
        metric: t.String(),
        inverterId: t.Optional(t.String()),
        bucket: t.Optional(t.Union([t.Literal("minute"), t.Literal("hour"), t.Literal("day")])),
        hours: t.Number({ default: 168, minimum: 1 }),
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
      const error = validateWrite(body.key, body.value);
      if (error) return status(400, { error });
      await inverter.write(body.key, body.value);
      return { ok: true, key: body.key, value: body.value };
    },
    { body: t.Object({ key: t.String(), value: t.Number() }) },
  )
  .listen(env.PORT, () => {
    console.log(
      `Server running on http://localhost:${env.PORT} — profile "${profile.id}" (simulate=${env.INVERTER_SIMULATE})`,
    );
  });

// Optional MQTT integration bridge (retained state topics, `.../set` writes,
// Home Assistant discovery). `null` when MQTT_ENABLED=false.
const mqttBridge = startMqttBridge();

/**
 * The God-loop: poll the inverter at 1Hz, persist every metric to TimescaleDB
 * (one row per metric), broadcast the sample to every WebSocket client, and
 * publish it to the MQTT bridge when enabled.
 */
const pollTimer = setInterval(async () => {
  try {
    const sample = await inverter.read();
    // Cache for the "current value" REST endpoints (/api/v1/state, /entities/:key).
    liveState.set(sample);
    const rows = Object.entries(sample.metrics).map(([metric, value]) => ({
      time: new Date(sample.time),
      inverterId: sample.inverterId,
      metric,
      value,
    }));
    if (rows.length > 0) await db.insert(metricsRaw).values(rows);
    app.server?.publish(METRICS_TOPIC, JSON.stringify(sample));
    mqttBridge?.publishSample(sample);
  } catch (error) {
    console.error("poll loop error:", error);
  }
}, env.POLL_INTERVAL_MS);

// Graceful shutdown: stop polling and release the inverter transport (closes
// the Modbus socket on real sources; a no-op for the simulator).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    clearInterval(pollTimer);
    await mqttBridge?.close();
    await inverter.close();
    process.exit(0);
  });
}

export type App = typeof app;
