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
    /** Modbus host. */
    host: z.string().optional(),
    port: z.number().int().default(502),
    /**
     * Framing over the socket: standard Modbus `tcp`, or `rtu-over-tcp` (RTU
     * frames tunneled over TCP — common with RS485→Ethernet gateways).
     */
    transport: z.enum(["tcp", "rtu-over-tcp"]).default("tcp"),
    /** Modbus unit / slave id. */
    unitId: z.number().int().default(0),
    /** Per-request Modbus timeout, ms. */
    timeoutMs: z.number().int().default(2000),
    /**
     * Poll cadence for the God-loop, ms. Floored at 1000: a full read is
     * several sequential Modbus block requests, and the app is designed around
     * a 1 s cadence — faster ticks just get dropped by the in-flight guard.
     */
    pollIntervalMs: z.number().int().min(1000).max(3_600_000).default(1000),
  })
  // Simulation is a deploy-level concern (env `INVERTER_SIMULATE`), not part of
  // this saved config, so the connection settings always describe a real target
  // and are always validated. The defaults are valid, so a fresh config passes.
  .superRefine((cfg, ctx) => {
    for (const c of CONNECTION_CHECKS) {
      if (c.ok(cfg)) continue;
      ctx.addIssue({ code: "custom", path: [c.path], message: c.message });
    }
  });

/** Range checks applied to the Modbus connection settings. */
const CONNECTION_CHECKS: ReadonlyArray<{
  path: keyof InverterConfig;
  message: string;
  ok: (cfg: InverterConfig) => boolean;
}> = [
  { path: "port", message: "Port must be 1–65535", ok: (c) => c.port >= 1 && c.port <= 65535 },
  { path: "unitId", message: "Unit id must be 0–255", ok: (c) => c.unitId >= 0 && c.unitId <= 255 },
  {
    path: "timeoutMs",
    message: "Timeout must be 100–60000 ms",
    ok: (c) => c.timeoutMs >= 100 && c.timeoutMs <= 60_000,
  },
];
export type InverterConfig = z.infer<typeof inverterConfigSchema>;
