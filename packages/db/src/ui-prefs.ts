/**
 * Dashboard visibility preferences — which metrics the web app hides from view.
 * Stored in `app_settings` under the key {@link UI_PREFS_KEY} and validated with
 * {@link uiPrefsSchema} on read/write. Hidden metrics are still polled, stored,
 * and published to MQTT / the public API; this only affects what the dashboard
 * renders. A single instance-wide setting, mirroring the display/tariff pattern.
 */

import { z } from "zod";

/** `app_settings.key` under which the visibility preferences are stored. */
export const UI_PREFS_KEY = "uiPrefs";

export const uiPrefsSchema = z
  .object({
    /** Individual metric keys hidden from the dashboard. */
    hiddenKeys: z.array(z.string()).default([]),
    /** Whole metric groups hidden (e.g. `generator`) — hides every metric in them. */
    hiddenGroups: z.array(z.string()).default([]),
  })
  .strict();
export type UiPrefs = z.infer<typeof uiPrefsSchema>;

/** Nothing hidden — the default before any preference is configured. */
export const defaultUiPrefs: UiPrefs = uiPrefsSchema.parse({});
