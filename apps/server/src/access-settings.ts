/**
 * Access preferences (public read-only dashboard toggle), cached in memory and
 * invalidated on write. Persisted via the shared `app_settings` accessor,
 * mirroring display-settings.ts.
 */

import {
  ACCESS_KEY,
  type AccessConfig,
  accessConfigSchema,
  defaultAccess,
} from "@SunReye/db/access";
import { readSetting, writeSetting } from "./app-settings";

let accessCache: AccessConfig | null = null;

/** Active access config, falling back to locked-down defaults when unset. */
export async function getAccess(): Promise<AccessConfig> {
  accessCache ??= await readSetting(ACCESS_KEY, accessConfigSchema, defaultAccess);
  return accessCache;
}

/** Validate and persist the access config (upsert), refreshing the cache. */
export async function setAccess(input: unknown): Promise<AccessConfig> {
  const config = accessConfigSchema.parse(input);
  await writeSetting(ACCESS_KEY, config);
  accessCache = config;
  return config;
}

/** Whether anonymous dashboard reads are currently allowed. */
export async function isPublicDashboard(): Promise<boolean> {
  return (await getAccess()).publicDashboard;
}
