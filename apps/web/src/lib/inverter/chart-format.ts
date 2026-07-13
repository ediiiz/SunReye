// Shared axis/tooltip formatters for the history charts (entity + custom). Both
// honour the configured time zone / 12–24h clock via the `display` store.
import { display } from "$lib/display.svelte";
import type { HistoryRange } from "./ranges";

const DAY_MS = 86_400_000;
const asDate = (v: unknown) => (v instanceof Date ? v : new Date(v as string | number));

/** Tooltip axis label: date only for day buckets, date + time for finer buckets. */
export function tooltipLabel(range: HistoryRange, v: unknown): string {
  const d = asDate(v);
  return range.bucket === "day" ? display.day(d) : display.dayTime(d);
}

/**
 * X-axis tick label: clock time for live/day-scale windows (where the time of
 * day is the point), calendar date for multi-day spans (where a repeated
 * "00:00" would be ambiguous).
 */
export function xTick(range: HistoryRange, v: unknown): string {
  const d = asDate(v);
  if (range.live) return display.time(d);
  if (range.bucket === "day") return display.day(d);
  return range.to.getTime() - range.from.getTime() <= 1.5 * DAY_MS
    ? display.time(d)
    : display.day(d);
}
