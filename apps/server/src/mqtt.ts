/**
 * MQTT integration bridge.
 *
 * Publishes every entity's latest value (retained) to
 * `<prefix>/<inverterId>/<topic>` and accepts writes on `.../set` for writable
 * entities — the same topics the vendor docs describe. Optionally publishes
 * Home Assistant MQTT Discovery configs so ReyeON auto-populates in HA with no
 * manual entity setup.
 *
 * Like every other transport in this app, the surface is generated from the
 * active profile's entity catalog: topics, discovery components, and validation
 * all derive from {@link ManifestMetric} / {@link EntityConstraint}. Adding a
 * metric to a profile extends the MQTT surface with zero code here.
 *
 * Disabled by default (`MQTT_ENABLED=false`); `startMqttBridge()` returns `null`
 * so the God-loop simply never publishes.
 */

import { env } from "@ReyeON/env/server";
import type { EntityConstraint, InverterSample, ManifestMetric } from "@ReyeON/inverter-core";
import { buildManifest, entityConstraint, metricByKey } from "@ReyeON/inverter-core";
import mqtt from "mqtt";
import type { MqttClient } from "mqtt";
import { validateWrite } from "./entities";
import { inverter, profile } from "./inverter";

const manifest = buildManifest(profile);
const defByKey = metricByKey(profile);

/** Root topic for this inverter, e.g. `reyeon/deye-sunsynk`. */
const base = `${env.MQTT_TOPIC_PREFIX}/${profile.id}`;
/** Retained online/offline flag (LWT); referenced by HA discovery availability. */
const availabilityTopic = `${base}/status`;

const stateTopic = (m: ManifestMetric): string => `${base}/${m.topic}`;
const commandTopic = (m: ManifestMetric): string => `${base}/${m.topic}/set`;

/** HA object ids / unique ids must be a restricted charset; keys are dotted. */
const slug = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Stable HA device the entities attach to. */
const haDevice = {
  identifiers: [`reyeon_${profile.id}`],
  name: manifest.name,
  manufacturer: manifest.manufacturer,
  model: profile.id,
};

/** HA `device_class` by unit. `%` depends on role, so it's handled separately. */
const DEVICE_CLASS_BY_UNIT: Record<string, string> = {
  W: "power",
  VA: "apparent_power",
  kWh: "energy",
  V: "voltage",
  A: "current",
  Hz: "frequency",
  "°C": "temperature",
};

/** HA `device_class`, inferred from unit/role. Omitted when nothing fits. */
function deviceClass(m: ManifestMetric): string | undefined {
  if (m.unit === "%") return m.role === "battery.soc" ? "battery" : undefined;
  return m.unit ? DEVICE_CLASS_BY_UNIT[m.unit] : undefined;
}

/** HA `state_class`: cumulative counters increase monotonically, else a scalar. */
function stateClass(m: ManifestMetric): string | undefined {
  if (m.kind === "cumulative") return "total_increasing";
  if (m.kind === "measurement") return "measurement";
  return undefined;
}

/** Drop `undefined`-valued keys so optional HA config fields are simply absent. */
function clean<T extends Record<string, unknown>>(config: T): T {
  return Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined)) as T;
}

/** Jinja mapping a published raw value to its friendly enum label (state side). */
const valueToLabelTemplate = (labels: Record<number, string>): string =>
  `{% set m = ${JSON.stringify(labels)} %}{{ m[value] if value in m else value }}`;

type Discovery = { component: string; config: Record<string, unknown> };

/**
 * The HA discovery component for an entity and its config payload.
 *
 * - writable enum → `select` (options are the friendly labels; templates map
 *   label ↔ raw value both ways).
 * - writable number → `number` (min/max from the profile range).
 * - read-only enum/status → `sensor` with a template that renders the label.
 * - everything else → `sensor` with device/state class.
 */
function discoveryConfig(m: ManifestMetric, c: EntityConstraint): Discovery {
  const shared = clean({
    name: m.label,
    unique_id: `reyeon_${profile.id}_${slug(m.key)}`,
    object_id: `reyeon_${slug(m.key)}`,
    state_topic: stateTopic(m),
    availability_topic: availabilityTopic,
    unit_of_measurement: m.unit ?? undefined,
    device: haDevice,
  });
  const labels = m.enumLabels;

  if (c.writable && labels) {
    // label→value for commands, value→label for state display.
    const toValue = Object.fromEntries(Object.entries(labels).map(([v, l]) => [l, Number(v)]));
    return {
      component: "select",
      config: {
        ...shared,
        command_topic: commandTopic(m),
        options: Object.values(labels),
        command_template: `{% set m = ${JSON.stringify(toValue)} %}{{ m[value] }}`,
        value_template: valueToLabelTemplate(labels),
      },
    };
  }

  if (c.writable) {
    return {
      component: "number",
      config: clean({
        ...shared,
        command_topic: commandTopic(m),
        min: c.min,
        max: c.max,
        mode: "box",
        device_class: deviceClass(m),
      }),
    };
  }

  if (labels) {
    return {
      component: "sensor",
      config: { ...shared, value_template: valueToLabelTemplate(labels) },
    };
  }

  return {
    component: "sensor",
    config: clean({ ...shared, device_class: deviceClass(m), state_class: stateClass(m) }),
  };
}

export interface MqttBridge {
  /** Publish every metric in a sample to its retained state topic. */
  publishSample(sample: InverterSample): void;
  close(): Promise<void>;
}

/**
 * Connect to the broker and wire up the bridge, or return `null` when MQTT is
 * disabled. Command subscriptions and (optional) HA discovery are (re)published
 * on every `connect` so they survive broker restarts and reconnects.
 */
export function startMqttBridge(): MqttBridge | null {
  if (!env.MQTT_ENABLED) return null;

  const client: MqttClient = mqtt.connect(env.MQTT_BROKER_URL, {
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    // LWT: the broker flips us to "offline" if the connection drops, so HA
    // marks the entities unavailable instead of showing a stale last value.
    will: { topic: availabilityTopic, payload: "offline", qos: 0, retain: true },
  });

  // Writable entities, indexed by their command topic for O(1) inbound dispatch.
  const keyByCommandTopic = new Map<string, string>();
  for (const m of manifest.metrics) {
    if (m.writable) keyByCommandTopic.set(commandTopic(m), m.key);
  }

  client.on("connect", () => {
    client.publish(availabilityTopic, "online", { retain: true });

    const commandTopics = [...keyByCommandTopic.keys()];
    if (commandTopics.length > 0) {
      client.subscribe(commandTopics, (err) => {
        if (err) console.error("[mqtt] subscribe failed:", err);
      });
    }

    if (env.HA_DISCOVERY_ENABLED) {
      for (const m of manifest.metrics) {
        const def = defByKey.get(m.key);
        if (!def) continue;
        const { component, config } = discoveryConfig(m, entityConstraint(def));
        const topic = `${env.HA_DISCOVERY_PREFIX}/${component}/reyeon_${profile.id}/${slug(m.key)}/config`;
        client.publish(topic, JSON.stringify(config), { retain: true });
      }
      console.log(`[mqtt] published HA discovery for ${manifest.metrics.length} entities`);
    }

    console.log(`[mqtt] connected to ${env.MQTT_BROKER_URL} (prefix "${base}")`);
  });

  client.on("message", async (topic, payload) => {
    const key = keyByCommandTopic.get(topic);
    if (!key) return; // Not a command topic we own.
    const value = Number(payload.toString().trim());
    if (Number.isNaN(value)) {
      console.warn(`[mqtt] ${topic}: non-numeric payload "${payload.toString()}"`);
      return;
    }
    const error = validateWrite(key, value);
    if (error) {
      console.warn(`[mqtt] ${topic}: rejected ${value}: ${error}`);
      return;
    }
    try {
      await inverter.write(key, value);
    } catch (err) {
      console.error(`[mqtt] write ${key}=${value} failed:`, err);
    }
  });

  client.on("error", (err) => console.error("[mqtt] client error:", err));

  return {
    publishSample(sample) {
      // Skip while offline: state topics are retained "latest value", so there's
      // nothing to gain from queueing stale samples for replay on reconnect.
      if (!client.connected) return;
      for (const m of manifest.metrics) {
        const value = sample.metrics[m.key];
        if (value === undefined) continue;
        client.publish(stateTopic(m), String(value), { retain: true });
      }
    },
    async close() {
      // Flip availability to "offline" cleanly before disconnecting so HA
      // doesn't have to wait for the LWT timeout.
      await new Promise<void>((resolve) => {
        client.publish(availabilityTopic, "offline", { retain: true }, () => resolve());
      });
      await client.endAsync();
    },
  };
}
