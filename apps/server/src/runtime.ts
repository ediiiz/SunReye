/**
 * Runtime controller — owns the live inverter source, the poll loop, and the
 * MQTT bridge, and rebuilds them on the fly when connection settings change so
 * the operator never has to restart the process.
 *
 * The God-loop lives here: poll the source, cache the sample, persist it, hand
 * it to the WebSocket publisher (injected via {@link start}), and publish it to
 * the MQTT bridge. Connection health is tracked for the `/api/status` endpoint.
 */

import { db } from "@ReyeON/db";
import type { InverterConfig } from "@ReyeON/db/inverter-config";
import type { MqttConfig } from "@ReyeON/db/mqtt-config";
import { metricsRaw } from "@ReyeON/db/schema/metrics";
import type { InverterSample, InverterSource } from "@ReyeON/inverter-core";
import mqtt from "mqtt";
import { getInverterConfig, getMqttConfig } from "./config";
import { buildSource, profile } from "./inverter";
import { type MqttBridge, startMqttBridge } from "./mqtt";
import { liveState } from "./state";

type SampleListener = (sample: InverterSample) => void;

let source: InverterSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let bridge: MqttBridge | null = null;
let onSample: SampleListener = () => {};
let polling = false;

const inverterStatus = {
  connected: false,
  simulate: true,
  lastError: null as string | null,
  lastSampleAt: null as string | null,
};

/** One poll: read, cache, persist, fan out to WebSocket + MQTT. */
async function pollOnce(): Promise<void> {
  // Skip if the previous poll is still running (a slow/reconnecting source must
  // not let ticks stack up).
  if (!source || polling) return;
  polling = true;
  const active = source;
  try {
    const sample = await active.read();
    inverterStatus.connected = true;
    inverterStatus.lastError = null;
    inverterStatus.lastSampleAt = sample.time;
    liveState.set(sample);
    const rows = Object.entries(sample.metrics).map(([metric, value]) => ({
      time: new Date(sample.time),
      inverterId: sample.inverterId,
      metric,
      value,
    }));
    if (rows.length > 0) await db.insert(metricsRaw).values(rows);
    onSample(sample);
    bridge?.publishSample(sample);
  } catch (error) {
    inverterStatus.connected = false;
    inverterStatus.lastError = error instanceof Error ? error.message : String(error);
    console.error("poll loop error:", error);
  } finally {
    polling = false;
  }
}

function restartLoop(intervalMs: number): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollOnce, intervalMs);
}

/** Apply an inbound command write to the live source. */
export async function write(key: string, value: number): Promise<void> {
  if (!source) throw new Error("inverter not started");
  await source.write(key, value);
}

async function rebuildInverter(config: InverterConfig): Promise<void> {
  const previous = source;
  source = buildSource(config);
  inverterStatus.simulate = config.simulate;
  // The simulator is always "connected"; a real Modbus source only proves it on
  // the first successful read, so start pessimistic and let pollOnce flip it.
  inverterStatus.connected = config.simulate;
  inverterStatus.lastError = null;
  restartLoop(config.pollIntervalMs);
  if (previous) await previous.close();
}

async function rebuildBridge(config: MqttConfig): Promise<void> {
  const previous = bridge;
  bridge = startMqttBridge(config, { write });
  if (previous) await previous.close();
}

/** Boot the controller: build the source + bridge and start polling. */
export async function start(listener: SampleListener): Promise<void> {
  onSample = listener;
  await rebuildInverter(await getInverterConfig());
  await rebuildBridge(await getMqttConfig());
}

/** Rebuild the source (and restart the loop) for updated inverter settings. */
export async function applyInverterConfig(config: InverterConfig): Promise<void> {
  await rebuildInverter(config);
}

/** Rebuild the MQTT bridge for updated broker/discovery settings. */
export async function applyMqttConfig(config: MqttConfig): Promise<void> {
  await rebuildBridge(config);
}

/** Live health for `/api/status`. */
export function status() {
  return {
    inverter: { ...inverterStatus, profile: profile.id },
    mqtt: bridge
      ? { enabled: true, ...bridge.status() }
      : { enabled: false, connected: false, lastError: null },
  };
}

/** Try a config against a throwaway source without disturbing the live one. */
export async function testInverter(
  config: InverterConfig,
): Promise<{ ok: boolean; error?: string; metricCount?: number }> {
  const probe = buildSource(config);
  try {
    const sample = await probe.read();
    return { ok: true, metricCount: Object.keys(sample.metrics).length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await probe.close();
  }
}

/** Try connecting to a broker without disturbing the live bridge. */
export function testMqtt(config: MqttConfig): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const client = mqtt.connect(config.brokerUrl, {
      username: config.username,
      password: config.password,
      connectTimeout: 4000,
      reconnectPeriod: 0, // one shot — don't loop retrying a bad broker
    });
    let settled = false;
    const done = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      client.end(true, () => {});
      resolve(result);
    };
    client.once("connect", () => done({ ok: true }));
    client.once("error", (err) => done({ ok: false, error: err.message }));
    setTimeout(() => done({ ok: false, error: "connection timed out" }), 5000);
  });
}

/** Stop polling and release the source + bridge (graceful shutdown). */
export async function stop(): Promise<void> {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  await bridge?.close();
  await source?.close();
}
