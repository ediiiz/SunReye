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
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
