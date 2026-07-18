/**
 * Pure energy arithmetic — no database, no inverter. Derives, for one period's
 * summed energy flows, the grid-vs-solar consumption split and the
 * self-consumed-vs-exported production split (plus the self-sufficiency and
 * self-consumption ratios those splits represent). DB-free so it can be
 * unit-tested in isolation (see energy-calc.test.ts); the DB-bound, per-period
 * grouping lives in energy.ts.
 *
 * The self-sufficiency / self-consumption formulas mirror {@link ./cost-calc}
 * exactly so the Costs page tiles and the energy-split chart agree.
 */

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Energy flows summed over one period, before the display splits are derived. */
export interface EnergyTotals {
  importKwh: number;
  exportKwh: number;
  loadKwh: number;
  productionKwh: number;
}

/** One period of energy flows, split for stacked-bar display. */
export interface PeriodEnergy extends EnergyTotals {
  /** Local period key: `YYYY-MM-DDTHH` (hour) | `YYYY-MM-DD` (day) | `YYYY-MM` (month). */
  bucket: string;
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

/**
 * Overlay live current-day energy on a period's `*.total`-delta totals: every
 * field present in `today` replaces the delta-derived value, while fields absent
 * from `today` keep it. Pure — returns a fresh object and never mutates either
 * input. Lets the in-progress day be sourced from the live `*.today` registers
 * (which lead the coarse cross-bucket counter delta) while older, complete
 * periods keep the `*.total` delta as their source of truth. A field carrying an
 * explicit `0` in `today` still overrides — only `undefined` (absent) is skipped.
 */
export function applyTodayOverride(
  totals: EnergyTotals,
  today: Partial<EnergyTotals>,
): EnergyTotals {
  return {
    importKwh: today.importKwh ?? totals.importKwh,
    exportKwh: today.exportKwh ?? totals.exportKwh,
    loadKwh: today.loadKwh ?? totals.loadKwh,
    productionKwh: today.productionKwh ?? totals.productionKwh,
  };
}

/** Derive the display splits and ratios for one period's summed energy. */
export function derivePeriodEnergy(bucket: string, totals: EnergyTotals): PeriodEnergy {
  const { importKwh, exportKwh, loadKwh, productionKwh } = totals;
  const gridToLoadKwh = Math.min(importKwh, loadKwh);
  const solarToLoadKwh = Math.max(0, loadKwh - importKwh);
  const selfConsumedKwh = Math.max(0, productionKwh - exportKwh);
  return {
    bucket,
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
