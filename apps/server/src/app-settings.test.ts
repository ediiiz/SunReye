import { beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";

// app-settings talks to the app_settings table through the DB singleton. Mock
// the drizzle chains it uses (select→from→where→limit, insert→values→
// onConflictDoUpdate) with an inspectable in-memory stand-in so read/write/
// cachedSetting can be exercised without a database.
let selectRows: Array<{ key: string; value: unknown }> = [];
let selectCalls = 0;
let upserts: Array<{ key: string; value: unknown }> = [];
mock.module("@SunReye/db", () => ({
  db: {
    select: () => {
      selectCalls++;
      return { from: () => ({ where: () => ({ limit: async () => selectRows }) }) };
    },
    insert: () => ({
      values: (row: { key: string; value: unknown }) => ({
        onConflictDoUpdate: async () => {
          upserts.push(row);
        },
      }),
    }),
  },
}));

// Other test files register process-global mocks for "./app-settings" (they
// consume it; this file tests it). The query suffix resolves to a distinct
// module instance, bypassing any such mock regardless of file order while
// still linking against the @SunReye/db mock above.
const { cachedSetting, readSetting, writeSetting } =
  // @ts-expect-error — tsc can't resolve the query-suffixed specifier; bun can.
  (await import("./app-settings?real")) as typeof import("./app-settings");

const schema = z.object({ speed: z.number().int().min(1) });
const fallback = { speed: 1 };

beforeEach(() => {
  selectRows = [];
  selectCalls = 0;
  upserts = [];
});

describe("readSetting", () => {
  test("returns the stored value when the row parses", async () => {
    selectRows = [{ key: "s", value: { speed: 7 } }];
    await expect(readSetting("s", schema, fallback)).resolves.toEqual({ speed: 7 });
  });

  test("falls back when no row exists", async () => {
    await expect(readSetting("s", schema, fallback)).resolves.toEqual(fallback);
  });

  test("falls back when the stored value no longer matches the schema", async () => {
    // e.g. a row written before a schema change.
    selectRows = [{ key: "s", value: { speed: "fast" } }];
    await expect(readSetting("s", schema, fallback)).resolves.toEqual(fallback);
  });
});

describe("writeSetting", () => {
  test("upserts the value under its key", async () => {
    await writeSetting("s", { speed: 3 });
    expect(upserts).toEqual([{ key: "s", value: { speed: 3 } }]);
  });
});

describe("cachedSetting", () => {
  test("get() reads once and serves later calls from memory", async () => {
    selectRows = [{ key: "c", value: { speed: 5 } }];
    const setting = cachedSetting("c", schema, fallback);
    await expect(setting.get()).resolves.toEqual({ speed: 5 });
    await expect(setting.get()).resolves.toEqual({ speed: 5 });
    expect(selectCalls).toBe(1);
  });

  test("set() validates, persists, and refreshes the cache", async () => {
    const setting = cachedSetting("c", schema, fallback);
    await expect(setting.set({ speed: 9 })).resolves.toEqual({ speed: 9 });
    expect(upserts).toEqual([{ key: "c", value: { speed: 9 } }]);
    // The refreshed cache answers get() without another select.
    await expect(setting.get()).resolves.toEqual({ speed: 9 });
    expect(selectCalls).toBe(0);
  });

  test("set() rejects invalid input and keeps the cached value", async () => {
    selectRows = [{ key: "c", value: { speed: 5 } }];
    const setting = cachedSetting("c", schema, fallback);
    await setting.get();
    expect(setting.set({ speed: 0 })).rejects.toThrow();
    await expect(setting.get()).resolves.toEqual({ speed: 5 });
    expect(upserts).toEqual([]);
  });
});
