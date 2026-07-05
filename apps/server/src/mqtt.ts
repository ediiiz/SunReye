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
 * Config-driven and hot-swappable: `startMqttBridge(config, deps)` returns
 * `null` when disabled. The runtime controller owns the lifecycle and injects
 * the inverter `write`, so this module has no singleton/env coupling.
 */

import type { MqttConfig } from "@ReyeON/db/mqtt-config";
import type { EntityConstraint, InverterSample, ManifestMetric } from "@ReyeON/inverter-core";
import { buildManifest, entityConstraint, metricByKey } from "@ReyeON/inverter-core";
import mqtt from "mqtt";
import type { MqttClient } from "mqtt";
import { validateWrite } from "./entities";
import { profile } from "./inverter";
import { log } from "./logging";

const logger = log("mqtt");
const manifest = buildManifest(profile);
const defByKey = metricByKey(profile);

/** HA object ids / unique ids must be a restricted charset; keys are dotted. */
const slug = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Stable HA device the entities attach to. */
const haDevice = {
  identifiers: [`reyeon_${profile.id}`],
  name: manifest.name,
  manufacturer: manifest.manufacturer,
  model: profile.id,
};

/** Topic builders for a given prefix (`<prefix>/<inverterId>/...`). */
function topicsFor(prefix: string) {
  const base = `${prefix}/${profile.id}`;
  return {
    base,
    availability: `${base}/status`,
    state: (m: ManifestMetric): string => `${base}/${m.topic}`,
    command: (m: ManifestMetric): string => `${base}/${m.topic}/set`,
  };
}
type Topics = ReturnType<typeof topicsFor>;

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
function discoveryConfig(m: ManifestMetric, c: EntityConstraint, topics: Topics): Discovery {
  const shared = clean({
    name: m.label,
    unique_id: `reyeon_${profile.id}_${slug(m.key)}`,
    object_id: `reyeon_${slug(m.key)}`,
    state_topic: topics.state(m),
    availability_topic: topics.availability,
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
        command_topic: topics.command(m),
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
        command_topic: topics.command(m),
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

export interface MqttStatus {
  connected: boolean;
  lastError: string | null;
}

export interface MqttBridge {
  /** Publish every metric in a sample to its retained state topic. */
  publishSample(sample: InverterSample): void;
  status(): MqttStatus;
  close(): Promise<void>;
}

export interface MqttBridgeDeps {
  /** Apply an inbound command write (validated by the bridge first). */
  write(key: string, value: number): Promise<void>;
}

/**
 * Connect to the broker and wire up the bridge, or return `null` when MQTT is
 * disabled. Command subscriptions and (optional) HA discovery are (re)published
 * on every `connect` so they survive broker restarts and reconnects.
 */
export function startMqttBridge(config: MqttConfig, deps: MqttBridgeDeps): MqttBridge | null {
  if (!config.enabled) return null;

  const topics = topicsFor(config.topicPrefix);
  let connected = false;
  let lastError: string | null = null;

  const client: MqttClient = mqtt.connect(config.brokerUrl, {
    username: config.username,
    password: config.password,
    // LWT: the broker flips us to "offline" if the connection drops, so HA
    // marks the entities unavailable instead of showing a stale last value.
    will: { topic: topics.availability, payload: "offline", qos: 0, retain: true },
  });

  // Writable entities, indexed by their command topic for O(1) inbound dispatch.
  const keyByCommandTopic = new Map<string, string>();
  for (const m of manifest.metrics) {
    if (m.writable) keyByCommandTopic.set(topics.command(m), m.key);
  }

  client.on("connect", () => {
    connected = true;
    lastError = null;
    client.publish(topics.availability, "online", { retain: true });

    const commandTopics = [...keyByCommandTopic.keys()];
    if (commandTopics.length > 0) {
      client.subscribe(commandTopics, (err) => {
        if (err) logger.error("subscribe failed: {error}", { error: err });
      });
    }

    if (config.haDiscoveryEnabled) {
      for (const m of manifest.metrics) {
        const def = defByKey.get(m.key);
        if (!def) continue;
        const { component, config: cfg } = discoveryConfig(m, entityConstraint(def), topics);
        const topic = `${config.haDiscoveryPrefix}/${component}/reyeon_${profile.id}/${slug(m.key)}/config`;
        client.publish(topic, JSON.stringify(cfg), { retain: true });
      }
      logger.info("published HA discovery for {count} entities", {
        count: manifest.metrics.length,
      });
    }

    logger.info('connected to {brokerUrl} (prefix "{prefix}")', {
      brokerUrl: config.brokerUrl,
      prefix: topics.base,
    });
  });

  client.on("close", () => {
    connected = false;
  });

  client.on("message", async (topic, payload) => {
    const key = keyByCommandTopic.get(topic);
    if (!key) return; // Not a command topic we own.
    const value = Number(payload.toString().trim());
    if (Number.isNaN(value)) {
      logger.warn('{topic}: non-numeric payload "{payload}"', {
        topic,
        payload: payload.toString(),
      });
      return;
    }
    const error = validateWrite(key, value);
    if (error) {
      logger.warn("{topic}: rejected {value}: {error}", { topic, value, error });
      return;
    }
    try {
      await deps.write(key, value);
    } catch (err) {
      logger.error("write {key}={value} failed: {error}", { key, value, error: err });
    }
  });

  client.on("error", (err) => {
    lastError = err instanceof Error ? err.message : String(err);
    logger.error("client error: {error}", { error: err });
  });

  return {
    publishSample(sample) {
      // Skip while offline: state topics are retained "latest value", so there's
      // nothing to gain from queueing stale samples for replay on reconnect.
      if (!client.connected) return;
      for (const m of manifest.metrics) {
        const value = sample.metrics[m.key];
        if (value === undefined) continue;
        client.publish(topics.state(m), String(value), { retain: true });
      }
    },
    status() {
      return { connected, lastError };
    },
    async close() {
      // Flip availability to "offline" cleanly before disconnecting so HA
      // doesn't have to wait for the LWT timeout.
      await new Promise<void>((resolve) => {
        client.publish(topics.availability, "offline", { retain: true }, () => resolve());
      });
      await client.endAsync();
    },
  };
}
