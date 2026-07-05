import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // HTTP port the core engine listens on.
    PORT: z.coerce.number().int().positive().default(3000),

    // Lowest LogTape severity that reaches the console sink. Unset defaults to
    // "debug" in development and "info" otherwise (resolved in the logging setup).
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warning", "error", "fatal"]).optional(),

    // Active inverter profile id (from an installed `@ReyeON/inverter-*` package)
    INVERTER_PROFILE: z.string().min(1).default("deye-sunsynk"),
    // Inverter (Modbus TCP) connection
    INVERTER_HOST: z.string().min(1).default("192.168.1.100"),
    INVERTER_PORT: z.coerce.number().int().positive().default(502),
    INVERTER_UNIT_ID: z.coerce.number().int().min(1).default(1),
    // Polling cadence for the 1Hz God-loop (milliseconds)
    POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
    // When true, generate synthetic metrics instead of talking to hardware
    INVERTER_SIMULATE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),

    // Comma-separated API keys authorizing third-party access to the public
    // `/api/v1` integration API (Authorization: Bearer <key> or x-api-key).
    // Empty is allowed in development (open); in production an empty list fails
    // closed and every `/api/v1` request is rejected.
    API_KEYS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      ),

    // MQTT bridge: publishes each entity's value to `<prefix>/<inverterId>/<topic>`
    // (retained) and accepts writes on `.../set` for writable entities. Off by
    // default so the server never dials a broker unless asked to.
    MQTT_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    MQTT_BROKER_URL: z.string().default("mqtt://localhost:1883"),
    MQTT_TOPIC_PREFIX: z.string().min(1).default("reyeon"),
    MQTT_USERNAME: z.string().optional(),
    MQTT_PASSWORD: z.string().optional(),

    // Home Assistant MQTT Discovery: publishes retained entity configs under
    // `<HA_DISCOVERY_PREFIX>/...` so ReyeON auto-populates in Home Assistant.
    // Requires MQTT_ENABLED.
    HA_DISCOVERY_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    HA_DISCOVERY_PREFIX: z.string().min(1).default("homeassistant"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
