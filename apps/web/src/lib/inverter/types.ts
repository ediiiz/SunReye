// Client-side view of the inverter contract. Types come straight from the
// core package so the UI can never drift from what the server sends. These are
// type-only imports — erased at build, so no Modbus/driver code reaches the
// browser bundle.
import type {
  CanonicalRole,
  InverterCapabilities,
  InverterManifest,
  ManifestMetric,
  MetricKind,
} from "@ReyeON/inverter-core";

export type { CanonicalRole, InverterCapabilities, InverterManifest, ManifestMetric, MetricKind };

/** One live sample off the WebSocket: metric key → engineering-unit value. */
export type LiveSample = {
  time: string;
  inverterId: string;
  metrics: Record<string, number>;
};

/** A single point in an in-memory live series (epoch ms + value). */
export type LivePoint = { t: number; v: number };
