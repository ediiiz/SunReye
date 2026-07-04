/**
 * Inverter connection config — the runtime-editable source settings that used
 * to live only in env. Stored in `app_settings` under {@link INVERTER_KEY} and
 * validated with {@link inverterConfigSchema}. The active profile is *not* here:
 * it shapes routes/manifest/topics built once at boot, so it stays env-driven
 * (profile switching arrives with the downloadable-profile work in P3).
 *
 * Shared by the server (runtime controller) and the web app (settings form).
 */

import { z } from "zod";

/** `app_settings.key` under which the inverter config is stored. */
export const INVERTER_KEY = "inverter";

export const inverterConfigSchema = z.object({
  /** When true, run the built-in simulator instead of dialing Modbus. */
  simulate: z.boolean().default(true),
  /** Modbus TCP host. */
  host: z.string().min(1).default("192.168.1.100"),
  port: z.number().int().min(1).max(65535).default(502),
  /** Modbus unit / slave id. */
  unitId: z.number().int().min(1).max(255).default(1),
  /** Per-request Modbus timeout, ms. */
  timeoutMs: z.number().int().min(100).max(60_000).default(2000),
  /** Poll cadence for the God-loop, ms. */
  pollIntervalMs: z.number().int().min(200).max(3_600_000).default(1000),
});
export type InverterConfig = z.infer<typeof inverterConfigSchema>;
