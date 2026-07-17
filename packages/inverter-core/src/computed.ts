import type { MetricDef, MetricValues } from "./types";

/**
 * Run every computed metric against the current values (mutates in place).
 *
 * When a computed metric declares a {@link MetricDef.range}, its result is
 * clamped to those bounds. Computed values (unlike writes) are otherwise
 * unbounded, so a ratio over a signed denominator — e.g. inverter efficiency,
 * whose denominator mixes signed battery/grid power — can land below 0 or above
 * 100 and wreck graph auto-scaling. Clamping here keeps any range-annotated
 * computed metric physically sensible for every transport at once.
 */
export function applyComputed(metrics: MetricDef[], values: MetricValues): void {
  for (const def of metrics) {
    if (!def.compute) continue;
    const value = def.compute(values);
    values[def.key] = def.range ? Math.min(def.range.max, Math.max(def.range.min, value)) : value;
  }
}
