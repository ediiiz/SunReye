/**
 * DB-backed application settings. Currently the tariff config; the same
 * `app_settings` store will hold inverter/MQTT connection settings in a later
 * phase. Reads are cached in memory and invalidated on write, so hot paths
 * (the cost engine) don't hit the database per request.
 */

import { db } from "@ReyeON/db";
import { appSettings } from "@ReyeON/db/schema/settings";
import {
  TARIFF_KEY,
  type TariffConfig,
  defaultTariff,
  tariffConfigSchema,
} from "@ReyeON/db/tariff";
import { eq } from "drizzle-orm";

let tariffCache: TariffConfig | null = null;

/** Active tariff config, falling back to neutral defaults when unset/invalid. */
export async function getTariff(): Promise<TariffConfig> {
  if (tariffCache) return tariffCache;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, TARIFF_KEY)).limit(1);
  const parsed = row ? tariffConfigSchema.safeParse(row.value) : null;
  tariffCache = parsed?.success ? parsed.data : defaultTariff;
  return tariffCache;
}

/** Validate and persist the tariff config (upsert), refreshing the cache. */
export async function setTariff(input: unknown): Promise<TariffConfig> {
  const config = tariffConfigSchema.parse(input);
  await db
    .insert(appSettings)
    .values({ key: TARIFF_KEY, value: config })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: config, updatedAt: new Date() },
    });
  tariffCache = config;
  return config;
}
