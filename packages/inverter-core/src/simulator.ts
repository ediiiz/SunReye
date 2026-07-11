import { applyComputed } from "./computed";
import type {
  InverterProfile,
  InverterSample,
  InverterSource,
  MetricDef,
  MetricValues,
  SimState,
} from "./types";

/**
 * Generic per-metric fallback used for any metric the profile's `simulate`
 * hook does not set (typically stable settings / time-of-use / idle ports).
 * Deliberately noise-free so config values look stable.
 */
function fallback(def: MetricDef): number {
  switch (def.unit) {
    case "%":
      return 50;
    case "V":
      return def.group === "generator" ? 0 : 230;
    case "°C":
      return 25;
    default:
      return 0;
  }
}

/**
 * A {@link InverterSource} that synthesizes samples without hardware. Delegates
 * the coherent power model to `profile.simulate` and fills the rest generically.
 * Writes update simulation state so settings round-trip.
 */
export class SimulatedInverter implements InverterSource {
  readonly profile: InverterProfile;
  private readonly state: SimState = {};
  private readonly overrides: MetricValues = {};
  private lastTime: number | null = null;

  constructor(profile: InverterProfile) {
    this.profile = profile;
  }

  read(): Promise<InverterSample> {
    const now = new Date();
    const dtSec = this.lastTime === null ? 0 : (now.getTime() - this.lastTime) / 1000;
    this.lastTime = now.getTime();

    const modeled = this.profile.simulate?.({ now, dtSec, state: this.state }) ?? {};

    const metrics: MetricValues = {};
    for (const def of this.profile.metrics) {
      if (def.compute) continue;
      if (def.type === "RAW") continue;
      metrics[def.key] = this.overrides[def.key] ?? modeled[def.key] ?? fallback(def);
    }
    applyComputed(this.profile.metrics, metrics);

    return Promise.resolve({ time: now.toISOString(), inverterId: this.profile.id, metrics });
  }

  write(key: string, value: number): Promise<void> {
    const def = this.profile.metrics.find((m) => m.key === key);
    if (!def) return Promise.reject(new Error(`unknown metric: ${key}`));
    if (def.access !== "rw") return Promise.reject(new Error(`metric is read-only: ${key}`));
    this.overrides[key] = value;
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
