/**
 * Access control preferences — who may view the live dashboard. Stored in
 * `app_settings` under the key {@link ACCESS_KEY} and validated with
 * {@link accessConfigSchema} on read/write. A single instance-wide setting,
 * mirroring the display/tariff/MQTT config pattern.
 */

import { z } from "zod";

/** `app_settings.key` under which the access config is stored. */
export const ACCESS_KEY = "access";

export const accessConfigSchema = z.object({
  /**
   * When true, the live dashboard's **read** endpoints (profile, history, cost,
   * energy, and the metrics WebSocket) are viewable **without a session** — a
   * fully anonymous kiosk / wall-display view. Config reads stay admin-only and
   * every write/command stays gated regardless. Off by default (locked down).
   */
  publicDashboard: z.boolean().default(false),
});
export type AccessConfig = z.infer<typeof accessConfigSchema>;

/** Locked-down defaults used before a preference is configured. */
export const defaultAccess: AccessConfig = accessConfigSchema.parse({});
