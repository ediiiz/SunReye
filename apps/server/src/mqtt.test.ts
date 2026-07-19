import { mqttConfigSchema } from "@SunReye/db/mqtt-config";
import { defineProfile, hydrateProfile, metric, parseProfileData } from "@SunReye/inverter-core";
import type { InverterSample } from "@SunReye/inverter-core";
import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

// Never dial a real broker: replace the mqtt package with an EventEmitter-backed
// fake that records publishes/subscriptions and lets tests emit client events.
class FakeMqttClient extends EventEmitter {
  connected = false;
  ended = false;
  published: Array<{ topic: string; payload: string; opts?: Record<string, unknown> }> = [];
  subscribed: Array<string | string[]> = [];
  subscribeCallbacks: Array<(err: Error | null) => void> = [];

  publish(topic: string, payload: string | Buffer, opts?: unknown, callback?: unknown): this {
    if (typeof opts === "function") {
      callback = opts;
      opts = undefined;
    }
    this.published.push({
      topic,
      payload: String(payload),
      opts: opts as Record<string, unknown> | undefined,
    });
    (callback as (() => void) | undefined)?.();
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
    this.connected = false;
  }
}

const clients: FakeMqttClient[] = [];
const connectCalls: Array<{ url: string; opts: Record<string, unknown> }> = [];
mock.module("mqtt", () => ({
  default: {
    connect: (url: string, opts: Record<string, unknown>) => {
      const client = new FakeMqttClient();
      clients.push(client);
      connectCalls.push({ url, opts });
      return client;
    },
  },
}));

const { startMqttBridge } = await import("./mqtt");
const { buildProfileContext } = await import("./inverter");

/** Profile spanning every discovery shape: select, number (with + without
 *  range), enum sensor, measurement, cumulative counter, SoC, bare sensor. */
const profile = hydrateProfile(
  parseProfileData(
    defineProfile({
      id: "mqtt-test-profile",
      name: "MQTT Test",
      manufacturer: "ACME",
      version: "1.0.0",
      metrics: [
        metric("settings/max_power", {
          label: "Max power",
          unit: "W",
          group: "settings",
          addr: 10,
          access: "rw",
          range: { min: 0, max: 6000 },
        }),
        metric("settings/level", {
          label: "Level",
          unit: null,
          group: "settings",
          addr: 11,
          access: "rw",
          // No range: HA number falls back to the permissive envelope.
        }),
        metric("settings/mode", {
          label: "Mode",
          unit: null,
          group: "settings",
          addr: 12,
          access: "rw",
          enumLabels: { 0: "Off", 1: "On" },
        }),
        metric("status/state", {
          label: "State",
          unit: null,
          group: "status",
          addr: 13,
          enumLabels: { 0: "Wait", 1: "Run" },
        }),
        metric("pv/power", {
          label: "PV power",
          unit: "W",
          group: "pv",
          addr: 14,
          kind: "measurement",
        }),
        metric("pv/energy_total", {
          label: "PV energy",
          unit: "kWh",
          group: "pv",
          addr: 15,
          kind: "cumulative",
        }),
        metric("battery/soc", {
          label: "SOC",
          unit: "%",
          group: "battery",
          addr: 16,
          role: "battery.soc",
        }),
        metric("battery/health", {
          label: "Health",
          unit: "%",
          group: "battery",
          addr: 17,
        }),
      ],
    }),
  ),
);
const ctx = buildProfileContext(profile);

const enabledConfig = mqttConfigSchema.parse({
  enabled: true,
  brokerUrl: "mqtt://broker.test:1883",
  username: "user",
  password: "secret",
  haDiscoveryEnabled: true,
});

describe("startMqttBridge", () => {
  test("returns null when MQTT is disabled", () => {
    const before = clients.length;
    const disabled = startMqttBridge(mqttConfigSchema.parse({ enabled: false }), {
      ctx,
      write: async () => {},
    });
    expect(disabled).toBeNull();
    expect(clients).toHaveLength(before); // no client was dialed
  });

  // One bridge instance drives the connect/dispatch/publish/close tests below —
  // the same client lifecycle production sees.
  const writes: Array<{ key: string; value: number }> = [];
  let failWrite = false;
  const bridge = startMqttBridge(enabledConfig, {
    ctx,
    write: async (key, value) => {
      if (failWrite) throw new Error("device write failed");
      writes.push({ key, value });
    },
  })!;
  const client = clients[0]!;
  const base = "sunreye/mqtt-test-profile";

  test("dials the broker with credentials and an offline LWT", () => {
    expect(bridge).not.toBeNull();
    expect(connectCalls[0]?.url).toBe("mqtt://broker.test:1883");
    expect(connectCalls[0]?.opts.username).toBe("user");
    expect(connectCalls[0]?.opts.will).toMatchObject({
      topic: `${base}/status`,
      payload: "offline",
    });
    expect(bridge.status()).toEqual({ connected: false, lastError: null });
  });

  test("on connect: availability, command subscriptions, HA discovery", () => {
    client.emit("connect");
    expect(bridge.status().connected).toBe(true);

    // Retained "online" availability.
    expect(client.published[0]).toMatchObject({
      topic: `${base}/status`,
      payload: "online",
      opts: { retain: true },
    });

    // Only the three writable entities get command subscriptions.
    expect(client.subscribed[0]).toEqual([
      `${base}/settings/max_power/set`,
      `${base}/settings/level/set`,
      `${base}/settings/mode/set`,
    ]);

    // Discovery: one retained config per metric under the HA prefix.
    const discovery = new Map(
      client.published
        .filter((p) => p.topic.startsWith("homeassistant/"))
        .map((p) => [p.topic, JSON.parse(p.payload) as Record<string, unknown>]),
    );
    expect(discovery.size).toBe(profile.metrics.length);

    const dTopic = (component: string, key: string) =>
      `homeassistant/${component}/sunreye_mqtt-test-profile/${key}/config`;

    // Writable number with a declared range.
    expect(discovery.get(dTopic("number", "settings_max_power"))).toMatchObject({
      min: 0,
      max: 6000,
      device_class: "power",
      command_topic: `${base}/settings/max_power/set`,
      default_entity_id: "number.sunreye_settings_max_power",
    });
    // Writable number without a range: permissive fallback, not HA's 0–100.
    expect(discovery.get(dTopic("number", "settings_level"))).toMatchObject({
      min: 0,
      max: 100_000,
    });
    // Writable enum → select with label options and mapping templates.
    const select = discovery.get(dTopic("select", "settings_mode"));
    expect(select).toMatchObject({ options: ["Off", "On"] });
    expect(select?.command_template).toContain('"Off":0');
    // Read-only enum → sensor rendering the friendly label.
    expect(discovery.get(dTopic("sensor", "status_state"))?.value_template).toContain('"Run"');
    // Measurement / cumulative state classes and unit-driven device classes.
    expect(discovery.get(dTopic("sensor", "pv_power"))).toMatchObject({
      device_class: "power",
      state_class: "measurement",
    });
    expect(discovery.get(dTopic("sensor", "pv_energy_total"))).toMatchObject({
      device_class: "energy",
      state_class: "total_increasing",
    });
    // "%" is battery only for the SoC role.
    expect(discovery.get(dTopic("sensor", "battery_soc"))).toMatchObject({
      device_class: "battery",
    });
    expect(discovery.get(dTopic("sensor", "battery_health"))?.device_class).toBeUndefined();
  });

  test("a failed command subscription is logged, not fatal", () => {
    expect(() => client.subscribeCallbacks[0]?.(new Error("broker refused"))).not.toThrow();
  });

  test("dispatches valid command payloads to the injected write", async () => {
    client.emit("message", `${base}/settings/max_power/set`, Buffer.from("1500"));
    await Bun.sleep(1);
    expect(writes).toEqual([{ key: "settings.max_power", value: 1500 }]);
  });

  test("rejects non-numeric and constraint-violating payloads", async () => {
    client.emit("message", `${base}/settings/max_power/set`, Buffer.from("full"));
    client.emit("message", `${base}/settings/max_power/set`, Buffer.from("9999")); // > max 6000
    client.emit("message", `${base}/some/other/topic`, Buffer.from("1")); // not ours
    await Bun.sleep(1);
    expect(writes).toHaveLength(1); // unchanged
  });

  test("a throwing device write is logged, not fatal", async () => {
    failWrite = true;
    client.emit("message", `${base}/settings/max_power/set`, Buffer.from("1000"));
    await Bun.sleep(1);
    failWrite = false;
    expect(writes).toHaveLength(1); // unchanged
  });

  test("publishSample publishes retained state topics while connected", () => {
    const sample: InverterSample = {
      time: new Date().toISOString(),
      inverterId: profile.id,
      metrics: { "pv.power": 4200, "battery.soc": 55 }, // others absent → skipped
    };
    const before = client.published.length;
    client.connected = false;
    bridge.publishSample(sample); // offline → nothing published
    expect(client.published).toHaveLength(before);

    client.connected = true;
    bridge.publishSample(sample);
    const state = client.published.slice(before);
    expect(state).toEqual([
      { topic: `${base}/pv/power`, payload: "4200", opts: { retain: true } },
      { topic: `${base}/battery/soc`, payload: "55", opts: { retain: true } },
    ]);
  });

  test("tracks close and error events in status()", () => {
    client.emit("close");
    expect(bridge.status().connected).toBe(false);
    client.emit("error", new Error("broker down"));
    expect(bridge.status().lastError).toBe("broker down");
  });

  test("close() flips availability to offline before disconnecting", async () => {
    await bridge.close();
    expect(client.published.at(-1)).toMatchObject({
      topic: `${base}/status`,
      payload: "offline",
      opts: { retain: true },
    });
    expect(client.ended).toBe(true);
  });

  test("a profile without writable entities subscribes to nothing", () => {
    const sensorsOnly = buildProfileContext(
      hydrateProfile(
        parseProfileData(
          defineProfile({
            id: "mqtt-sensors-only",
            name: "Sensors",
            manufacturer: "ACME",
            version: "1.0.0",
            metrics: [metric("pv/power", { label: "PV power", unit: "W", group: "pv", addr: 1 })],
          }),
        ),
      ),
    );
    // Discovery off: the discovery block is skipped entirely.
    const quiet = startMqttBridge(
      mqttConfigSchema.parse({ enabled: true, brokerUrl: "mqtt://broker.test:1883" }),
      { ctx: sensorsOnly, write: async () => {} },
    )!;
    const c = clients.at(-1)!;
    c.emit("connect");
    expect(c.subscribed).toHaveLength(0);
    expect(c.published.filter((p) => p.topic.startsWith("homeassistant/"))).toHaveLength(0);
    expect(quiet.status().connected).toBe(true);
  });
});
