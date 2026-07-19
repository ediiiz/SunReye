import { CONTROL_STATE_KEY, type ControlState } from "@SunReye/db/control-state";
import { describe, expect, mock, test } from "bun:test";
import type { ZodType } from "zod";

// dbControlStore persists through the app-settings accessor. Replace it with an
// in-memory store (all three exports, since bun's mock.module is
// process-global) so the cache-on-read / invalidate-on-write behavior can run
// without a database.
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

const { dbControlStore } = await import("./control-store");

describe("dbControlStore", () => {
  test("get() resolves the persisted (or default) control state", async () => {
    // The singleton's cache may be warm from another file in the shared
    // process, so assert shape rather than exact emptiness.
    const state = await dbControlStore.get();
    expect(state).toBeObject();
  });

  test("set() persists and refreshes the cached read", async () => {
    const next: ControlState = {
      "inv-1:settings.lock": { previousValue: 30, lockedAt: new Date().toISOString() },
    };
    await dbControlStore.set(next);
    expect(store.get(CONTROL_STATE_KEY)).toEqual(next);
    // The refreshed cache answers get() directly.
    await expect(dbControlStore.get()).resolves.toEqual(next);
  });
});
