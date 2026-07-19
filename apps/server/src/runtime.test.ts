import { inverterConfigSchema } from "@SunReye/db/inverter-config";
import { mqttConfigSchema } from "@SunReye/db/mqtt-config";
import { env } from "@SunReye/env/server";
import {
  control,
  defineProfile,
  hydrateProfile,
  metric,
  parseProfileData,
  registerProfile,
} from "@SunReye/inverter-core";
import type { InverterSample } from "@SunReye/inverter-core";
import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { ZodType } from "zod";

// --- module mocks ------------------------------------------------------------

// Force the simulator source (deterministic reads, no Modbus socket) and keep
// everything else exactly as the real env. Intervals stay huge so the real
// timers never fire mid-test; the loop is driven by invoking the captured
// callbacks directly.
mock.module("@SunReye/env/server", () => ({
  env: { ...env, INVERTER_SIMULATE: true },
}));

// Broker access goes through the mqtt package; fake it (no network).
class FakeMqttClient extends EventEmitter {
  connected = false;
  ended = false;
  published: Array<{ topic: string; payload: string }> = [];
  publish(topic: string, payload: string | Buffer, _opts?: unknown, callback?: unknown): this {
    this.published.push({ topic, payload: String(payload) });
    (callback as (() => void) | undefined)?.();
    return this;
  }
  subscribe(_topics: string | string[], cb?: (err: Error | null) => void): this {
    cb?.(null);
    return this;
  }
  end(_force?: boolean, cb?: () => void): this {
    this.ended = true;
    cb?.();
    return this;
  }
  async endAsync(): Promise<void> {
    this.ended = true;
  }
}
const clients: FakeMqttClient[] = [];
mock.module("mqtt", () => ({
  default: {
    connect: () => {
      const client = new FakeMqttClient();
      clients.push(client);
      return client;
    },
  },
}));

// Settings persist through the app-settings accessor; back it with memory.
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

// History rows land via db.insert(metricsRaw).values(batch); make it
// inspectable and failable. select().from().where() backs resolveProfileById.
let insertShouldThrow = false;
let insertedRows: unknown[] = [];
mock.module("@SunReye/db", () => ({
  db: {
    select: () => ({
      from: () =>
        Object.assign(Promise.resolve([]), {
          where: async () => [],
        }),
    }),
    insert: () => ({
      values: (batch: unknown[]) => {
        if (insertShouldThrow) return Promise.reject(new Error("db is down"));
        insertedRows.push(...batch);
        return Object.assign(Promise.resolve(), { onConflictDoUpdate: async () => {} });
      },
    }),
  },
}));

const runtime = await import("./runtime");
const { buildProfileContext } = await import("./inverter");
const { setInverterConfig, setMqttConfig } = await import("./config");
const { liveState } = await import("./state");

// --- fixtures ------------------------------------------------------------

const TARGET = "settings.max_discharge";
const LOCK = "settings.lock";
const profile = hydrateProfile(
  parseProfileData(
    defineProfile({
      id: "runtime-test-profile",
      name: "Runtime Test",
      manufacturer: "ACME",
      version: "1.0.0",
      metrics: [
        metric("settings/max_discharge", {
          label: "Max discharge",
          unit: "A",
          group: "settings",
          addr: 109,
          access: "rw",
        }),
        control<"settings.max_discharge">("settings/lock", {
          label: "Lock",
          group: "settings",
          enumLabels: { 0: "Unlocked", 1: "Locked" },
          controlExpr: { snapshotToggle: { target: TARGET, lockedValue: 0 } },
        }),
        metric("status/mode", {
          label: "Mode",
          unit: null,
          group: "status",
          addr: 110,
          enumLabels: { 0: "Wait", 1: "Run" },
        }),
        metric("battery/soc", {
          label: "SOC",
          unit: "%",
          group: "battery",
          addr: 111,
          role: "battery.soc",
        }),
      ],
    }),
  ),
);
const ctx = buildProfileContext(profile);

// Poll/flush cadence far beyond the test's lifetime; the captured callbacks
// drive the loop deterministically instead.
const POLL_MS = 3_600_000;
const FLUSH_MS = env.HISTORY_FLUSH_INTERVAL_MS;

// Capture interval callbacks (pass-through, so clearInterval keeps working).
const intervals: Array<{ fn: () => unknown; ms: number | undefined }> = [];
const timeouts: Array<{ fn: () => unknown; ms: number | undefined }> = [];
let intervalSpy: ReturnType<typeof spyOn<typeof globalThis, "setInterval">>;
let timeoutSpy: ReturnType<typeof spyOn<typeof globalThis, "setTimeout">>;
const realSetInterval = globalThis.setInterval;
const realSetTimeout = globalThis.setTimeout;

beforeAll(() => {
  intervalSpy = spyOn(globalThis, "setInterval");
  intervalSpy.mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) => {
    intervals.push({ fn, ms });
    return realSetInterval(fn, ms, ...args);
  }) as typeof setInterval);
  timeoutSpy = spyOn(globalThis, "setTimeout");
  timeoutSpy.mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) => {
    if (ms === 5000) {
      // testMqtt's one-shot guard: capture, but don't hold the loop for 5 s.
      timeouts.push({ fn, ms });
      return realSetTimeout(() => {}, 0);
    }
    return realSetTimeout(fn, ms, ...args);
  }) as typeof setTimeout);
});

afterAll(async () => {
  await runtime.stop();
  intervalSpy.mockRestore();
  timeoutSpy.mockRestore();
});

const pollFn = () => intervals.findLast((i) => i.ms === POLL_MS)!.fn;
const flushFn = () => intervals.findLast((i) => i.ms === FLUSH_MS)!.fn;

const samples: InverterSample[] = [];
let listenerShouldThrow = false;
const listener = (sample: InverterSample) => {
  if (listenerShouldThrow) throw new Error("listener boom");
  samples.push(sample);
};

// -----------------------------------------------------------------------------

describe("runtime controller", () => {
  test("before start: writes fail, config applies no-op, status degrades", async () => {
    expect(runtime.write(TARGET, 1)).rejects.toThrow("inverter not started");
    await runtime.applyInverterConfig(inverterConfigSchema.parse({ pollIntervalMs: POLL_MS }));
    await runtime.applyMqttConfig(mqttConfigSchema.parse({ enabled: true }));
    const status = runtime.status();
    expect(status.inverter.profile).toBeNull();
    expect(status.mqtt).toEqual({ enabled: false, connected: false, lastError: null });
  });

  test("start boots the simulator source and arms the loop", async () => {
    await setInverterConfig({ pollIntervalMs: POLL_MS });
    await setMqttConfig({ enabled: false });
    await runtime.start(listener, ctx);
    expect(runtime.status().inverter.profile).toBe("runtime-test-profile");
    expect(runtime.status().inverter.connected).toBe(true); // simulator: optimistic
    expect(intervals.some((i) => i.ms === POLL_MS)).toBe(true);
    expect(intervals.some((i) => i.ms === FLUSH_MS)).toBe(true);
  });

  test("a failing poll records the error and stays connected=false", async () => {
    listenerShouldThrow = true;
    await pollFn()();
    listenerShouldThrow = false;
    const status = runtime.status();
    expect(status.inverter.connected).toBe(false);
    expect(status.inverter.lastError).toBe("listener boom");
  });

  test("a successful poll caches, fans out, and buffers history", async () => {
    await pollFn()();
    expect(samples).toHaveLength(1);
    const sample = samples[0]!;
    expect(liveState.latest).toBe(sample);
    // The composite control owns no register but is folded into the sample.
    expect(sample.metrics[LOCK]).toBe(0);
    expect(sample.metrics[TARGET]).toBeDefined();
    const status = runtime.status();
    expect(status.inverter.connected).toBe(true);
    expect(status.inverter.lastSampleAt).toBe(sample.time);
  });

  test("overlapping ticks are dropped, not stacked", async () => {
    const before = samples.length;
    await Promise.all([pollFn()(), pollFn()()]);
    expect(samples.length).toBe(before + 1);
  });

  test("write() dispatches raw register writes to the source", async () => {
    await runtime.write(TARGET, 42);
    await pollFn()();
    expect(liveState.latest?.metrics[TARGET]).toBe(42); // simulator override
  });

  test("write() routes composite controls through the interpreter", async () => {
    await runtime.write(LOCK, 1); // lock: snapshot live value, write lockedValue
    await pollFn()();
    expect(liveState.latest?.metrics[TARGET]).toBe(0); // lockedValue applied
    expect(liveState.latest?.metrics[LOCK]).toBe(1); // lock state reported
    await runtime.write(LOCK, 0); // unlock: restore the snapshot
    await pollFn()();
    expect(liveState.latest?.metrics[TARGET]).toBe(42);
    expect(liveState.latest?.metrics[LOCK]).toBe(0);
  });

  test("history rows flush in one batch; a failed flush re-queues", async () => {
    insertShouldThrow = true;
    flushFn()();
    await Bun.sleep(5); // let the failed flush settle → rows re-queued
    insertShouldThrow = false;
    insertedRows = [];
    flushFn()();
    await Bun.sleep(5);
    expect(insertedRows.length).toBeGreaterThan(0);
    expect(insertedRows[0]).toMatchObject({ inverterId: "runtime-test-profile" });
  });

  test("hot-applying configs rebuilds the source and the bridge", async () => {
    await runtime.applyInverterConfig(inverterConfigSchema.parse({ pollIntervalMs: POLL_MS }));
    expect(runtime.status().inverter.connected).toBe(true);

    await runtime.applyMqttConfig(
      mqttConfigSchema.parse({ enabled: true, brokerUrl: "mqtt://broker.test:1883" }),
    );
    expect(runtime.status().mqtt.enabled).toBe(true);
    expect(clients.length).toBeGreaterThan(0);
    // Bridge in place: the next poll hands the sample to it (offline → skipped).
    await pollFn()();
    // Swapping the bridge closes the previous one.
    await runtime.applyMqttConfig(
      mqttConfigSchema.parse({ enabled: true, brokerUrl: "mqtt://broker.test:1883" }),
    );
    expect(clients[0]?.ended).toBe(true);
  });

  test("testInverter reads a snapshot from a throwaway probe", async () => {
    registerProfile(profile);
    const result = await runtime.testInverter(
      "runtime-test-profile",
      inverterConfigSchema.parse({}),
    );
    expect(result.ok).toBe(true);
    expect(result.metricCount).toBe(profile.metrics.length);
    expect(typeof result.durationMs).toBe("number");
    // Sorted by group, then label; enum values carry their friendly label.
    const groups = result.metrics!.map((m) => m.group);
    expect(groups).toEqual([...groups].sort());
    const mode = result.metrics!.find((m) => m.key === "status.mode")!;
    if (mode.value === 0 || mode.value === 1) {
      expect(mode.display).toBe(mode.value === 0 ? "Wait" : "Run");
    }
  });

  test("testInverter reports an unknown profile id", async () => {
    const result = await runtime.testInverter("ghost", inverterConfigSchema.parse({}));
    expect(result).toEqual({ ok: false, error: 'Unknown profile "ghost"' });
  });

  test("testMqtt resolves ok on connect, error on failure, once on timeout", async () => {
    const okPromise = runtime.testMqtt(mqttConfigSchema.parse({ enabled: true }));
    clients.at(-1)!.emit("connect");
    await expect(okPromise).resolves.toEqual({ ok: true });
    // The 5 s guard fires after settling: must be a silent no-op.
    expect(timeouts.length).toBeGreaterThan(0);
    timeouts.at(-1)!.fn();

    const failPromise = runtime.testMqtt(mqttConfigSchema.parse({ enabled: true }));
    clients.at(-1)!.emit("error", new Error("bad credentials"));
    await expect(failPromise).resolves.toEqual({ ok: false, error: "bad credentials" });
  });

  test("stop() drains the buffer and releases source + bridge", async () => {
    await pollFn()(); // leave something buffered
    insertedRows = [];
    await runtime.stop();
    expect(insertedRows.length).toBeGreaterThan(0); // drained on shutdown
    expect(clients.at(-2)?.ended ?? true).toBe(true);
  });
});
