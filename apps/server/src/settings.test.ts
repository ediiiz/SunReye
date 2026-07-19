import { TARIFF_KEY, tariffConfigSchema } from "@SunReye/db/tariff";
import { describe, expect, mock, test } from "bun:test";
import type { ZodType } from "zod";

// settings.ts persists through the app-settings accessor. Replace it with an
// in-memory store (all three exports, since bun's mock.module is
// process-global) so the tariff cache can be exercised without a database.
const store = new Map<string, unknown>();
async function readSetting<T>(key: string, schema: ZodType<T>, fallback: T): Promise<T> {
  if (!store.has(key)) return fallback;
  const parsed = schema.safeParse(store.get(key));
  return parsed.success ? parsed.data : fallback;
}
async function writeSetting<T>(key: string, value: T): Promise<void> {
  store.set(key, value);
}
function cachedSetting<T>(key: string, schema: ZodType<T>, fallback: T) {
  let cache: T | null = null;
  return {
    async get() {
      cache ??= await readSetting(key, schema, fallback);
      return cache;
    },
    async set(input: unknown) {
      cache = schema.parse(input);
      await writeSetting(key, cache);
      return cache;
    },
  };
}
mock.module("./app-settings", () => ({ readSetting, writeSetting, cachedSetting }));

const { getTariff, setTariff } = await import("./settings");

describe("tariff settings", () => {
  test("getTariff always yields a schema-valid config", async () => {
    // The module-level cache may already be warm from another test file (the
    // suite shares one process), so assert validity rather than exact defaults.
    const tariff = await getTariff();
    expect(tariffConfigSchema.parse(tariff)).toEqual(tariff);
  });

  test("setTariff validates, persists, and refreshes the cached read", async () => {
    const saved = await setTariff({
      currency: "USD",
      standingChargeMonthly: 12,
      import: { defaultPricePerKwh: 0.25, bands: [] },
      export: { feedInPerKwh: 0.07 },
    });
    expect(saved.currency).toBe("USD");
    expect(store.get(TARIFF_KEY)).toEqual(saved);
    await expect(getTariff()).resolves.toEqual(saved);
  });

  test("setTariff rejects an invalid config", () => {
    expect(setTariff({ currency: "EURO" })).rejects.toThrow();
  });
});
