/**
 * Monthly energy reporting: reads the daily TimescaleDB rollups over a
 * multi-month window and summarizes each calendar month into the grid-vs-solar
 * and self-consumed-vs-exported splits used by the 12-month charts. Pure math
 * lives in {@link ./energy-calc}; counter-delta DB reads are reused from
 * {@link ./cost}.
 */

import type { InverterProfile } from "@SunReye/inverter-core";
import { fetchDailyEnergy } from "./cost";
import {
  type MonthEnergy,
  emptyMonth,
  monthWindow,
  summarizeMonths,
} from "./energy-calc";

export type { MonthEnergy } from "./energy-calc";

/**
 * Per-month energy for the last `months` calendar months (default 12), oldest
 * first. Always returns exactly `months` entries: months with no rollup data
 * are zero-filled so the chart x-axis is stable.
 */
export async function monthlyEnergy(
  profile: InverterProfile,
  opts?: {
    months?: number;
    inverterId?: string;
    now?: Date;
  },
): Promise<MonthEnergy[]> {
  const months = opts?.months ?? 12;
  const inverterId = opts?.inverterId ?? profile.id;
  const now = opts?.now ?? new Date();

  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const days = await fetchDailyEnergy(profile, inverterId, from, now);
  const summarized = summarizeMonths(days);

  const byMonth = new Map(summarized.map((m) => [m.month, m]));
  return monthWindow(months, now).map((key) => byMonth.get(key) ?? emptyMonth(key));
}
