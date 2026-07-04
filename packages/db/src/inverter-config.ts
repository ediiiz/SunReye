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

export const inverterConfigSchema = z
  .object({
    /** When true, run the built-in simulator instead of dialing Modbus. */
    simulate: z.boolean().default(true),
    /** Modbus TCP host. */
    host: z.string().default("192.168.1.100"),
    port: z.number().int().default(502),
    /** Modbus unit / slave id. */
    unitId: z.number().int().default(1),
    /** Per-request Modbus timeout, ms. */
    timeoutMs: z.number().int().default(2000),
    /** Poll cadence for the God-loop, ms. */
    pollIntervalMs: z.number().int().min(200).max(3_600_000).default(1000),
  })
  // Connection settings only matter for a real Modbus source. When `simulate`
  // is on they're ignored, so don't reject an otherwise-fine config for a blank
  // host or out-of-range port — validate them only when dialing for real.
  .superRefine((cfg, ctx) => {
    if (cfg.simulate) return;
    for (const c of CONNECTION_CHECKS) {
      if (c.ok(cfg)) continue;
      ctx.addIssue({ code: "custom", path: [c.path], message: c.message });
    }
  });

/** Range checks applied to connection settings only when dialing a real inverter. */
const CONNECTION_CHECKS: ReadonlyArray<{
  path: keyof InverterConfig;
  message: string;
  ok: (cfg: InverterConfig) => boolean;
}> = [
  { path: "host", message: "Host is required", ok: (c) => c.host.length >= 1 },
  { path: "port", message: "Port must be 1–65535", ok: (c) => c.port >= 1 && c.port <= 65535 },
  { path: "unitId", message: "Unit id must be 1–255", ok: (c) => c.unitId >= 1 && c.unitId <= 255 },
  {
    path: "timeoutMs",
    message: "Timeout must be 100–60000 ms",
    ok: (c) => c.timeoutMs >= 100 && c.timeoutMs <= 60_000,
  },
];
export type InverterConfig = z.infer<typeof inverterConfigSchema>;
