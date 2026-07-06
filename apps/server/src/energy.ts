/**
 * Energy-split reporting: reads the counter-delta matrix over a window and
 * summarizes each period into the grid-vs-solar and self-consumed-vs-exported
 * splits used by the Costs page energy chart. Pure math lives in
 * {@link ./energy-calc}; the bounded delta read is shared with the cost engine
 * ({@link ./cost}).
 */

import type { InverterProfile } from "@SunReye/inverter-core";
import { type CostBucket, fetchCounterDeltaMatrix } from "./cost";
import { type EnergyTotals, type PeriodEnergy, derivePeriodEnergy } from "./energy-calc";

export type { PeriodEnergy } from "./energy-calc";

const emptyTotals = (): EnergyTotals => ({
  importKwh: 0,
  exportKwh: 0,
  loadKwh: 0,
  productionKwh: 0,
});

/**
 * Per-period energy splits over `[from, to)`, one entry per `bucket`
 * (hour / day / month), oldest first and zero-filled so the chart x-axis is
 * stable. Sub-daily windows read the hourly rollups; day/month windows read the
 * cheaper daily rollups — the split only needs per-period totals.
 */
export async function energySeries(
  profile: InverterProfile,
  opts: { from: Date; to: Date; bucket: CostBucket; inverterId?: string },
): Promise<PeriodEnergy[]> {
  const view = opts.bucket === "hour" ? "hourly_rollups" : "daily_rollups";
  const { rows, fieldByKey, periods } = await fetchCounterDeltaMatrix(profile, { ...opts, view });

  const totals = new Map<string, EnergyTotals>(periods.map((p) => [p, emptyTotals()]));
  for (const r of rows) {
    const field = fieldByKey.get(r.metric);
    const t = field && totals.get(r.period);
    if (!t) continue;
    const kwh = Number(r.kwh);
    if (field === "import") t.importKwh += kwh;
    else if (field === "export") t.exportKwh += kwh;
    else if (field === "load") t.loadKwh += kwh;
    else if (field === "production") t.productionKwh += kwh;
  }
  return periods.map((p) => derivePeriodEnergy(p, totals.get(p) ?? emptyTotals()));
}
