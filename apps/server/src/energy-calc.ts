/**
 * Pure energy arithmetic — no database, no inverter. Groups per-bucket energy
 * flows into calendar months and derives the grid-vs-solar consumption split
 * and the self-consumed-vs-exported production split (plus the self-sufficiency
 * and self-consumption ratios those splits represent). DB-free so it can be
 * unit-tested in isolation (see energy-calc.test.ts); the DB-bound
 * orchestration lives in energy.ts.
 *
 * The self-sufficiency / self-consumption formulas mirror {@link ./cost-calc}
 * exactly so the Costs page tiles and the 12-month charts agree.
 */

import type { HourEnergy } from "./cost-calc";

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Calendar-month key `YYYY-MM` from a Date's local month. */
const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** One calendar month of energy flows, split for stacked-bar display. */
export interface MonthEnergy {
  /** `YYYY-MM`, local time. */
  month: string;
  importKwh: number;
  exportKwh: number;
  loadKwh: number;
  productionKwh: number;
  /** Consumption served by the grid: min(import, load) → "from grid". */
  gridToLoadKwh: number;
  /** Consumption served on-site: max(0, load − import) → "from solar/battery". */
  solarToLoadKwh: number;
  /** Production used on-site: max(0, production − export) → "used on-site". */
  selfConsumedKwh: number;
  /** Production sent to the grid: export → "exported". */
  exportedKwh: number;
  /** solarToLoad / load, 0..1, or null when no load data. */
  selfSufficiency: number | null;
  /** selfConsumed / production, 0..1, or null when no production. */
  selfConsumption: number | null;
}

/** Derive the display splits and ratios for one month's summed energy. */
function deriveMonth(
  month: string,
  totals: { importKwh: number; exportKwh: number; loadKwh: number; productionKwh: number },
): MonthEnergy {
  const { importKwh, exportKwh, loadKwh, productionKwh } = totals;
  const gridToLoadKwh = Math.min(importKwh, loadKwh);
  const solarToLoadKwh = Math.max(0, loadKwh - importKwh);
  const selfConsumedKwh = Math.max(0, productionKwh - exportKwh);
  return {
    month,
    importKwh,
    exportKwh,
    loadKwh,
    productionKwh,
    gridToLoadKwh,
    solarToLoadKwh,
    selfConsumedKwh,
    exportedKwh: exportKwh,
    selfSufficiency: loadKwh > 0 ? clamp01(solarToLoadKwh / loadKwh) : null,
    selfConsumption: productionKwh > 0 ? clamp01(selfConsumedKwh / productionKwh) : null,
  };
}

/**
 * Group per-bucket energy figures (typically daily) into calendar months,
 * sorted ascending by month. Only months present in the input appear; padding
 * to a fixed window is the caller's job (see energy.ts).
 */
export function summarizeMonths(buckets: HourEnergy[]): MonthEnergy[] {
  const byMonth = new Map<
    string,
    { importKwh: number; exportKwh: number; loadKwh: number; productionKwh: number }
  >();

  for (const b of buckets) {
    const key = monthKey(b.time);
    const m = byMonth.get(key) ?? { importKwh: 0, exportKwh: 0, loadKwh: 0, productionKwh: 0 };
    m.importKwh += b.import;
    m.exportKwh += b.export;
    m.loadKwh += b.load;
    m.productionKwh += b.production;
    byMonth.set(key, m);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => deriveMonth(month, totals));
}

/** Build the zero-filled month key list ending at `now`, oldest first. */
export function monthWindow(months: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

/** An empty month (used to pad windows with no data). */
export function emptyMonth(month: string): MonthEnergy {
  return deriveMonth(month, { importKwh: 0, exportKwh: 0, loadKwh: 0, productionKwh: 0 });
}
