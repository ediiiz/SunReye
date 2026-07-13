/**
 * Display preferences (clock format, time zone), cached in memory and
 * invalidated on write. Persisted via the shared `app_settings` accessor,
 * mirroring settings.ts.
 */

import {
  DISPLAY_KEY,
  type DisplayConfig,
  defaultDisplay,
  displayConfigSchema,
} from "@SunReye/db/display";
import { readSetting, writeSetting } from "./app-settings";

let displayCache: DisplayConfig | null = null;

/** Active display config, falling back to locale-following defaults when unset. */
export async function getDisplay(): Promise<DisplayConfig> {
  displayCache ??= await readSetting(DISPLAY_KEY, displayConfigSchema, defaultDisplay);
  return displayCache;
}

/** Validate and persist the display config (upsert), refreshing the cache. */
export async function setDisplay(input: unknown): Promise<DisplayConfig> {
  const config = displayConfigSchema.parse(input);
  await writeSetting(DISPLAY_KEY, config);
  displayCache = config;
  return config;
}
