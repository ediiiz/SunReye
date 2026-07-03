import { cors } from "@elysiajs/cors";
import { auth } from "@ReyeON/auth";
import { db } from "@ReyeON/db";
import { metricsRaw } from "@ReyeON/db/schema/metrics";
import { env } from "@ReyeON/env/server";
import { buildManifest } from "@ReyeON/inverter-core";
import { and, desc, eq, gte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { inverter, profile } from "./inverter";

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
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )
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
  // TimescaleDB continuous aggregates, this reads the raw hypertable.
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
        hours: t.Number({ default: 24, minimum: 1 }),
        limit: t.Number({ default: 5000, minimum: 1, maximum: 50000 }),
        metric: t.Optional(t.String()),
        inverterId: t.Optional(t.String()),
      }),
    },
  )
  // Real-time write pipeline: push any writable setting to the inverter.
  .post(
    "/api/commands/setting",
    async ({ body }) => {
      await inverter.write(body.key, body.value);
      return { ok: true, key: body.key, value: body.value };
    },
    { body: t.Object({ key: t.String(), value: t.Number() }) },
  )
  // Convenience aliases for the two most common battery-current settings.
  .post(
    "/api/commands/charge-amps",
    async ({ body }) => {
      await inverter.write("settings.battery.maximum_charge_current", body.amps);
      return { ok: true, key: "settings.battery.maximum_charge_current", value: body.amps };
    },
    { body: t.Object({ amps: t.Number({ minimum: 0 }) }) },
  )
  .post(
    "/api/commands/discharge-amps",
    async ({ body }) => {
      await inverter.write("settings.battery.maximum_discharge_current", body.amps);
      return { ok: true, key: "settings.battery.maximum_discharge_current", value: body.amps };
    },
    { body: t.Object({ amps: t.Number({ minimum: 0 }) }) },
  )
  .listen(3000, () => {
    console.log(
      `Server running on http://localhost:3000 — profile "${profile.id}" (simulate=${env.INVERTER_SIMULATE})`,
    );
  });

/**
 * The God-loop: poll the inverter at 1Hz, persist every metric to TimescaleDB
 * (one row per metric), and broadcast the sample to every WebSocket client.
 */
const pollTimer = setInterval(async () => {
  try {
    const sample = await inverter.read();
    const rows = Object.entries(sample.metrics).map(([metric, value]) => ({
      time: new Date(sample.time),
      inverterId: sample.inverterId,
      metric,
      value,
    }));
    if (rows.length > 0) await db.insert(metricsRaw).values(rows);
    app.server?.publish(METRICS_TOPIC, JSON.stringify(sample));
  } catch (error) {
    console.error("poll loop error:", error);
  }
}, env.POLL_INTERVAL_MS);

// Graceful shutdown: stop polling and release the inverter transport (closes
// the Modbus socket on real sources; a no-op for the simulator).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    clearInterval(pollTimer);
    await inverter.close();
    process.exit(0);
  });
}

export type App = typeof app;
