/**
 * Profile distribution settings — the git repo sources to browse for
 * downloadable inverter profiles, and the id of the active profile. Both live
 * in `app_settings` (per-key Zod schema, like tariff/inverter/mqtt) so they are
 * editable from the UI without a redeploy.
 *
 * The active profile is intentionally *not* part of the hot-reloadable inverter
 * connection config: it shapes the REST routes, manifest, and MQTT topics built
 * once at boot, so changing it takes effect on the next restart.
 *
 * Shared by the server (boot loader + install endpoints) and the web app.
 */

import { z } from "zod";

/** `app_settings.key` under which the list of profile repo sources is stored. */
export const PROFILE_SOURCES_KEY = "profileSources";

/** `app_settings.key` under which the active profile id is stored. */
export const ACTIVE_PROFILE_KEY = "activeProfile";

/** The official, always-present profile repo. */
export const STANDARD_PROFILE_SOURCE = {
  url: "https://github.com/sunreye/inverter-profiles.git",
  label: "SunReye Official",
} as const;

/** Only public https git URLs are accepted (no ssh / private auth yet). */
const gitUrlSchema = z
  .url()
  .refine((u) => u.startsWith("https://"), "must be an https git URL")
  .refine((u) => u.endsWith(".git"), 'git URL should end with ".git"');

export const profileSourceSchema = z.object({
  url: gitUrlSchema,
  /** Optional friendly name for the UI. */
  label: z.string().optional(),
  /** Disabled sources are kept but skipped when browsing. */
  enabled: z.boolean().default(true),
});
export type ProfileSource = z.infer<typeof profileSourceSchema>;

export const profileSourcesSchema = z.object({
  sources: z.array(profileSourceSchema).default([{ ...STANDARD_PROFILE_SOURCE, enabled: true }]),
});
export type ProfileSources = z.infer<typeof profileSourcesSchema>;

export const activeProfileSchema = z.object({
  id: z.string().min(1),
});
export type ActiveProfile = z.infer<typeof activeProfileSchema>;
