import type { MetricDef, MetricValues } from "./types";

/** Run every computed metric against the current values (mutates in place). */
export function applyComputed(metrics: MetricDef[], values: MetricValues): void {
  for (const def of metrics) {
    if (def.compute) values[def.key] = def.compute(values);
  }
}
