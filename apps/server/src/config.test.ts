import { INVERTER_KEY } from "@SunReye/db/inverter-config";
import { MQTT_KEY } from "@SunReye/db/mqtt-config";
import { describe, expect, mock, test } from "bun:test";
import type { ZodType } from "zod";

// config.ts persists through the app-settings accessor. Replace it with an
// in-memory store so the env-seeding, caching, and password-merge behavior can
// run without a database. All three exports are provided so any other module
// resolving "./app-settings" during the run keeps working (bun's mock.module is
// process-global).
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

// A fresh, private instance of the module (query suffix → own registry entry):
// other files share the canonical instance and may have warmed its caches, so
// only a cold instance deterministically exercises the env-seeding path.
const { getInverterConfig, getMqttConfig, mergeMqttConfig, setInverterConfig, setMqttConfig } =
  // @ts-expect-error — tsc can't resolve the query-suffixed specifier; bun can.
  (await import("./config?fresh")) as typeof import("./config");

describe("inverter config", () => {
  test("is seeded from env defaults before anything is saved", async () => {
    const config = await getInverterConfig();
    expect(config.port).toBe(502);
    expect(config.transport).toBe("tcp");
    expect(config.unitId).toBe(0);
    expect(config.pollIntervalMs).toBe(1000);
  });

  test("set validates, persists, and refreshes the cached read", async () => {
    const saved = await setInverterConfig({ host: "10.0.0.5", port: 1502, unitId: 3 });
    expect(saved.host).toBe("10.0.0.5");
    expect(store.get(INVERTER_KEY)).toEqual(saved);
    await expect(getInverterConfig()).resolves.toEqual(saved);
  });

  test("set rejects an out-of-range connection setting", () => {
    expect(setInverterConfig({ port: 0 })).rejects.toThrow();
  });
});

describe("MQTT config", () => {
  test("is seeded from env defaults before anything is saved", async () => {
    const config = await getMqttConfig();
    expect(config.enabled).toBe(false);
    expect(config.brokerUrl).toBe("mqtt://localhost:1883");
    expect(config.topicPrefix).toBe("sunreye");
    expect(config.haDiscoveryPrefix).toBe("homeassistant");
  });

  test("set persists the merged config and refreshes the cache", async () => {
    const saved = await setMqttConfig({
      enabled: true,
      brokerUrl: "mqtt://broker:1883",
      username: "user",
      password: "s3cret",
    });
    expect(saved.password).toBe("s3cret");
    expect(store.get(MQTT_KEY)).toEqual(saved);
    await expect(getMqttConfig()).resolves.toEqual(saved);
  });

  test("a write omitting the password keeps the stored (write-only) one", async () => {
    const merged = await mergeMqttConfig({ enabled: true, brokerUrl: "mqtt://other:1883" });
    expect(merged.brokerUrl).toBe("mqtt://other:1883");
    expect(merged.password).toBe("s3cret");
  });

  test("a write carrying a password replaces the stored one", async () => {
    const merged = await mergeMqttConfig({ enabled: true, password: "n3w" });
    expect(merged.password).toBe("n3w");
  });
});
