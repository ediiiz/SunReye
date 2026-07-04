import type { ManifestMetric } from "./types";

/** Locale-aware number: always ≥1 decimal (so `2` reads `2.0`), capped at 2. */
function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/**
 * Render-ready value for a metric: status metrics resolve through their enum
 * labels, everything else is a formatted number. Missing → em dash.
 */
export function formatValue(metric: ManifestMetric, v: number | undefined): string {
  if (v === undefined) return "—";
  if (metric.kind === "status" && metric.enumLabels) {
    return metric.enumLabels[v] ?? String(v);
  }
  return formatNumber(v);
}

/**
 * Direction label for a signed metric (e.g. battery Charging/Discharging, grid
 * Importing/Exporting). Null when the metric has no flow semantics.
 */
export function flowLabel(metric: ManifestMetric, v: number | undefined): string | null {
  if (v === undefined || !metric.flow) return null;
  if (v > 0) return metric.flow.positive;
  if (v < 0) return metric.flow.negative;
  return "Idle";
}

/** Absolute value formatted for display (direction is shown separately). */
export function formatMagnitude(v: number | undefined): string {
  if (v === undefined) return "—";
  return formatNumber(Math.abs(v));
}
