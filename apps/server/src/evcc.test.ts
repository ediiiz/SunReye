import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { ZodType } from "zod";

// The subscriber dials the broker through the mqtt package; replace it with an
// EventEmitter-backed fake so connect/message/close flows run without a broker.
class FakeMqttClient extends EventEmitter {
  ended = false;
  published: Array<{ topic: string; payload: string }> = [];
  subscribed: Array<string | string[]> = [];
  subscribeCallbacks: Array<(err: Error | null) => void> = [];

  publish(topic: string, payload: string | Buffer): this {
    this.published.push({ topic, payload: String(payload) });
    return this;
  }

  subscribe(topics: string | string[], cb?: (err: Error | null) => void): this {
    this.subscribed.push(topics);
    if (cb) {
      this.subscribeCallbacks.push(cb);
      cb(null);
    }
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

// The EVCC + MQTT configs persist through the app-settings accessor; back it
// with an in-memory store (all three exports — bun's mock.module is
// process-global) so setEvccConfig drives evccReady without a database.
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

const {
  coercePayload,
  evccControl,
  evccSnapshot,
  parseLoadpointTopic,
  rebuildEvcc,
  setEvccListener,
  stopEvcc,
} = await import("./evcc");
const { setEvccConfig } = await import("./evcc-settings");
import type { EvccState } from "./evcc";

/** Resolve with the next debounced snapshot push. */
const nextEmit = () =>
  new Promise<EvccState>((resolve) => {
    setEvccListener(resolve);
  });

describe("parseLoadpointTopic", () => {
  test("parses a simple leaf into index + key", () => {
    expect(parseLoadpointTopic("evcc", "evcc/loadpoints/1/chargePower")).toEqual({
      index: 1,
      key: "chargePower",
    });
  });

  test("joins nested keys (multi-segment remainder)", () => {
    expect(parseLoadpointTopic("evcc", "evcc/loadpoints/2/chargeCurrents/l1")).toEqual({
      index: 2,
      key: "chargeCurrents/l1",
    });
    expect(parseLoadpointTopic("evcc", "evcc/loadpoints/1/planStrategy/continuous")).toEqual({
      index: 1,
      key: "planStrategy/continuous",
    });
  });

  test("ignores the retained loadpoint-count topic", () => {
    expect(parseLoadpointTopic("evcc", "evcc/loadpoints")).toBeNull();
  });

  test("ignores command topics and non-loadpoint topics", () => {
    expect(parseLoadpointTopic("evcc", "evcc/loadpoints/1/mode/set")).toBeNull();
    expect(parseLoadpointTopic("evcc", "evcc/site/pvPower")).toBeNull();
    expect(parseLoadpointTopic("evcc", "evcc/status")).toBeNull();
  });

  test("rejects non-numeric or bare indexes", () => {
    expect(parseLoadpointTopic("evcc", "evcc/loadpoints/x/mode")).toBeNull();
    expect(parseLoadpointTopic("evcc", "evcc/loadpoints/1")).toBeNull();
  });

  test("honors a custom topic root", () => {
    expect(parseLoadpointTopic("my/evcc", "my/evcc/loadpoints/1/mode")).toEqual({
      index: 1,
      key: "mode",
    });
    expect(parseLoadpointTopic("my/evcc", "evcc/loadpoints/1/mode")).toBeNull();
  });
});

describe("coercePayload", () => {
  test("numbers", () => {
    expect(coercePayload("3600")).toBe(3600);
    expect(coercePayload("-1831")).toBe(-1831);
    expect(coercePayload("97.219")).toBe(97.219);
  });

  test("booleans", () => {
    expect(coercePayload("true")).toBe(true);
    expect(coercePayload("false")).toBe(false);
  });

  test("null and empty (retained-delete) payloads", () => {
    expect(coercePayload("null")).toBeNull();
    expect(coercePayload("")).toBeNull();
  });

  test("strings stay strings (modes, titles, JSON blobs)", () => {
    expect(coercePayload("pv")).toBe("pv");
    expect(coercePayload("Tesla Model 3 Premium LR RWD")).toBe("Tesla Model 3 Premium LR RWD");
    expect(coercePayload('[{"start":"2026-07-19"}]')).toBe('[{"start":"2026-07-19"}]');
  });
});

describe("evcc subscriber", () => {
  test("stays off (null snapshot, no client) while disabled", async () => {
    await setEvccConfig({ enabled: false });
    await rebuildEvcc();
    expect(evccSnapshot()).toBeNull();
    expect(clients).toHaveLength(0);
    expect(() => evccControl(1, "mode", "now")).toThrow(/not connected/);
  });

  test("connects, subscribes, and reports unreachable until status arrives", async () => {
    await setEvccConfig({ enabled: true, topicRoot: "evcc", subtractFromHome: true });
    await rebuildEvcc();
    const client = clients.at(-1)!;
    expect(evccSnapshot()).toEqual({ reachable: false, loadpoints: [], subtractFromHome: true });

    client.emit("connect");
    expect(client.subscribed[0]).toEqual(["evcc/status", "evcc/loadpoints/#"]);
    // A failed subscribe is logged, not fatal.
    expect(() => client.subscribeCallbacks[0]?.(new Error("broker refused"))).not.toThrow();
  });

  test("ingests the retained snapshot into typed loadpoints (one debounced push)", async () => {
    const client = clients.at(-1)!;
    const push = nextEmit();

    const msg = (topic: string, payload: string) =>
      client.emit("message", topic, Buffer.from(payload));
    msg("evcc/status", "online");
    msg("evcc/loadpoints/1/title", "Carport");
    msg("evcc/loadpoints/1/mode", "pv");
    msg("evcc/loadpoints/1/chargePower", "4200");
    msg("evcc/loadpoints/1/charging", "true");
    msg("evcc/loadpoints/1/connected", "true");
    msg("evcc/loadpoints/1/vehicleSoc", "55");
    msg("evcc/loadpoints/1/vehicleName", "tesla"); // fallback for vehicleTitle
    msg("evcc/loadpoints/1/limitSoc", "80");
    msg("evcc/loadpoints/2/chargePower", "0"); // second loadpoint, sorted after 1
    msg("evcc/site/pvPower", "100"); // not a loadpoint topic → ignored
    msg("evcc/loadpoints/1/mode/set", "now"); // command echo → ignored

    const state = await push;
    expect(state.reachable).toBe(true);
    expect(state.loadpoints.map((lp) => lp.index)).toEqual([1, 2]);
    expect(state.loadpoints[0]).toEqual({
      index: 1,
      title: "Carport",
      mode: "pv",
      chargePower: 4200,
      charging: true,
      connected: true,
      vehicleSoc: 55,
      vehicleRange: null, // never published
      vehicleTitle: "tesla",
      sessionEnergy: null,
      limitSoc: 80,
      phasesActive: null,
    });
  });

  test("an empty retained payload deletes the topic's value", async () => {
    const client = clients.at(-1)!;
    const push = nextEmit();
    client.emit("message", "evcc/loadpoints/1/limitSoc", Buffer.alloc(0));
    const state = await push;
    expect(state.loadpoints[0]?.limitSoc).toBeNull();
  });

  test("evccControl publishes to the loadpoint's /set topic", () => {
    const client = clients.at(-1)!;
    evccControl(1, "mode", "now");
    expect(client.published).toEqual([{ topic: "evcc/loadpoints/1/mode/set", payload: "now" }]);
  });

  test("a dropped broker connection pushes reachable:false", async () => {
    const client = clients.at(-1)!;
    const push = nextEmit();
    client.emit("close");
    const state = await push;
    expect(state.reachable).toBe(false);
    // Client errors are logged, never thrown.
    expect(() => client.emit("error", new Error("boom"))).not.toThrow();
  });

  test("rebuilding while disabled tears the subscriber down", async () => {
    const client = clients.at(-1)!;
    // Leave a debounced emit pending so teardown also clears the timer.
    client.emit("message", "evcc/status", Buffer.from("online"));
    await setEvccConfig({ enabled: false });
    await rebuildEvcc();
    expect(evccSnapshot()).toBeNull();
    expect(client.ended).toBe(true);
    expect(() => evccControl(1, "mode", "now")).toThrow(/not connected/);
  });

  test("stopEvcc releases the client", async () => {
    await setEvccConfig({ enabled: true, topicRoot: "evcc" });
    await rebuildEvcc();
    const client = clients.at(-1)!;
    await stopEvcc();
    expect(client.ended).toBe(true);
    expect(evccSnapshot()).toBeNull();
  });
});
