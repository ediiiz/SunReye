/**
 * Thin typed accessor over the `app_settings` key/value table. Each setting is
 * validated against its Zod schema on read (falling back to a default when the
 * row is missing or invalid) and upserted on write. Callers layer their own
 * in-memory cache on top (see settings.ts / config.ts).
 */

import { db } from "@ReyeON/db";
import { appSettings } from "@ReyeON/db/schema/settings";
import { eq } from "drizzle-orm";
import type { ZodType } from "zod";

export async function readSetting<T>(key: string, schema: ZodType<T>, fallback: T): Promise<T> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  const parsed = row ? schema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : fallback;
}

export async function writeSetting<T>(key: string, value: T): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}
