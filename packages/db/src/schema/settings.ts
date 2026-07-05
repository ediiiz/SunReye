import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic key/value application settings, stored as JSONB and validated by a
 * per-key Zod schema at the edge (see `@SunReye/db/tariff`). Keeps runtime
 * configuration (tariffs now; inverter/MQTT connection later) in the database
 * instead of env files, so it can be edited from the UI without a redeploy.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export type AppSettingRow = typeof appSettings.$inferSelect;
export type AppSettingInsert = typeof appSettings.$inferInsert;
