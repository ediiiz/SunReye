import { cors } from "@elysiajs/cors";
import { auth } from "@ReyeON/auth";
import { db } from "@ReyeON/db";
import { metricsRaw } from "@ReyeON/db/schema/metrics";
import { env } from "@ReyeON/env/server";
import { desc, gte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { readMetrics, writeSetting } from "./modbus";

const MetricsSchema = t.Object({
  time: t.String(),
  pvPowerW: t.Number(),
  batterySoc: t.Number(),
  gridPowerW: t.Number(),
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
  // Live metrics stream: clients subscribe to the shared topic; the God-loop
  // publishes every sample via `app.server.publish(METRICS_TOPIC, ...)`.
  .ws("/ws/metrics", {
    response: MetricsSchema,
    open(ws) {
      ws.subscribe(METRICS_TOPIC);
    },
  })
  // Historical data (rollups live in TimescaleDB continuous aggregates; this
  // reads the raw hypertable for the requested window).
  .get(
    "/api/history",
    async ({ query }) => {
      const since = new Date(Date.now() - query.hours * 60 * 60 * 1000);
      return db
        .select()
        .from(metricsRaw)
        .where(gte(metricsRaw.time, since))
        .orderBy(desc(metricsRaw.time))
        .limit(query.limit);
    },
    {
      query: t.Object({
        hours: t.Number({ default: 24, minimum: 1 }),
        limit: t.Number({ default: 5000, minimum: 1, maximum: 50000 }),
      }),
    },
  )
  // Real-time write pipeline: push a setting to the inverter immediately.
  .post(
    "/api/commands/charge-amps",
    async ({ body }) => {
      await writeSetting("chargeAmps", body.amps);
      return { ok: true, setting: "chargeAmps", value: body.amps };
    },
    { body: t.Object({ amps: t.Number({ minimum: 0 }) }) },
  )
  .post(
    "/api/commands/discharge-amps",
    async ({ body }) => {
      await writeSetting("dischargeAmps", body.amps);
      return { ok: true, setting: "dischargeAmps", value: body.amps };
    },
    { body: t.Object({ amps: t.Number({ minimum: 0 }) }) },
  )
  .listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });

/**
 * The God-loop: poll the inverter at 1Hz, persist to TimescaleDB, and
 * broadcast the sample to every connected WebSocket client.
 */
setInterval(async () => {
  try {
    const sample = await readMetrics();
    await db.insert(metricsRaw).values({
      time: new Date(sample.time),
      pvPowerW: sample.pvPowerW,
      batterySoc: sample.batterySoc,
      gridPowerW: sample.gridPowerW,
    });
    app.server?.publish(METRICS_TOPIC, JSON.stringify(sample));
  } catch (error) {
    console.error("poll loop error:", error);
  }
}, env.POLL_INTERVAL_MS);

export type App = typeof app;
