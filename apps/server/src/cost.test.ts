import type { CanonicalRole, InverterProfile, InverterSample } from "@SunReye/inverter-core";
import { beforeEach, describe, expect, mock, test } from "bun:test";

// cost.ts imports the DB singleton (which eagerly validates server env). Mock it
// so the guard logic and the rollup readers can be imported and exercised
// without a database or a populated .env — mirroring inverter.test.ts's
// approach. `db.execute` answers from a FIFO of canned rollup rows (one entry
// per query the code under test issues); the select/insert chains back the
// tariff read/write through the real app-settings accessor.
let executeResults: Array<{ rows: unknown[] }> = [];
let executeCalls = 0;
mock.module("@SunReye/db", () => ({
  db: {
    execute: async () => {
      executeCalls++;
      return executeResults.shift() ?? { rows: [] };
    },
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }),
  },
}));

const {
  computeCost,
  computeCostSeries,
  currentPeriodKey,
  fetchCounterDeltaMatrix,
  resolveLiveTodayTotals,
} = await import("./cost");
const { setTariff } = await import("./settings");
const { liveState } = await import("./state");

/** Minimal profile mapping the given canonical roles → metric keys. */
const profileWith = (roleKeys: Partial<Record<CanonicalRole, string>>): InverterProfile =>
  ({
    id: "inv-1",
    metrics: Object.entries(roleKeys).map(([role, key]) => ({ role, key })),
  }) as unknown as InverterProfile;

/** All four today-twin roles mapped to distinct metric keys. */
const fullProfile = profileWith({
  "grid.energy.imported.today": "imp",
  "grid.energy.exported.today": "exp",
  "load.energy.today": "load",
  "production.today": "prod",
});

/** A live sample on the given local day, for `inv-1` unless overridden. */
const sample = (
  localDay: Date,
  metrics: Record<string, number>,
  inverterId = "inv-1",
): InverterSample => ({
  time: localDay.toISOString(),
  inverterId,
  metrics,
});

// A fixed "now" and a same-local-day sample time, both built from local fields
// so the same-day comparison holds regardless of the runner's timezone.
const now = new Date(2024, 5, 15, 13, 0, 0);
const today = new Date(2024, 5, 15, 12, 30, 0);
const yesterday = new Date(2024, 5, 14, 23, 59, 0);

const liveMetrics = { imp: 1.1, exp: 2.2, load: 8.6, prod: 5.5 };

describe("resolveLiveTodayTotals", () => {
  test("null live sample → empty (no override)", () => {
    expect(resolveLiveTodayTotals(fullProfile, null, "inv-1", now)).toEqual({});
  });

  test("inverterId mismatch → empty (no override)", () => {
    const s = sample(today, liveMetrics, "other-inverter");
    expect(resolveLiveTodayTotals(fullProfile, s, "inv-1", now)).toEqual({});
  });

  test("stale sample from a previous local day → empty (no override across midnight)", () => {
    const s = sample(yesterday, liveMetrics);
    expect(resolveLiveTodayTotals(fullProfile, s, "inv-1", now)).toEqual({});
  });

  test("all guards pass → every mapped, finite field is returned", () => {
    const s = sample(today, liveMetrics);
    expect(resolveLiveTodayTotals(fullProfile, s, "inv-1", now)).toEqual({
      importKwh: 1.1,
      exportKwh: 2.2,
      loadKwh: 8.6,
      productionKwh: 5.5,
    });
  });

  test("unmapped today-twin role → that field is left out (kept on the delta value)", () => {
    // Only load + production twins mapped; import/export absent from the profile.
    const partial = profileWith({
      "load.energy.today": "load",
      "production.today": "prod",
    });
    const s = sample(today, liveMetrics);
    expect(resolveLiveTodayTotals(partial, s, "inv-1", now)).toEqual({
      loadKwh: 8.6,
      productionKwh: 5.5,
    });
  });

  test("mapped role missing / non-finite in the sample → that field is skipped", () => {
    // `imp` absent, `exp` NaN, `prod` Infinity → only the finite `load` survives.
    const s = sample(today, { load: 8.6, exp: Number.NaN, prod: Number.POSITIVE_INFINITY });
    expect(resolveLiveTodayTotals(fullProfile, s, "inv-1", now)).toEqual({ loadKwh: 8.6 });
  });

  test("an explicit zero is a valid override (finite, not skipped)", () => {
    const s = sample(today, { imp: 0, exp: 0, load: 0, prod: 0 });
    expect(resolveLiveTodayTotals(fullProfile, s, "inv-1", now)).toEqual({
      importKwh: 0,
      exportKwh: 0,
      loadKwh: 0,
      productionKwh: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Rollup readers, driven by canned rollup rows through the mocked db.execute.
// ---------------------------------------------------------------------------

/** Profile mapping the cumulative `*.total` roles the rollup readers price. */
const totalsProfile = profileWith({
  "grid.energy.imported.total": "imp_t",
  "grid.energy.exported.total": "exp_t",
  "load.energy.total": "load_t",
});

/** Tariff with a banded import rate so hour-of-day pricing is observable.
 *  standingChargeMonthly of one avg month ⇒ exactly 1 currency unit per day. */
const tariffInput = {
  currency: "EUR",
  standingChargeMonthly: 30.4375,
  import: {
    defaultPricePerKwh: 0.3,
    bands: [{ name: "Night", pricePerKwh: 0.1, startHour: 0, endHour: 6 }],
  },
  export: { feedInPerKwh: 0.08 },
};

beforeEach(() => {
  executeResults = [];
  executeCalls = 0;
});

describe("computeCost", () => {
  test("prices cross-bucket counter deltas against the tariff bands", async () => {
    await setTariff(tariffInput);
    executeResults = [
      // Baseline: counter level entering the window, per metric.
      { rows: [{ metric: "imp_t", last_max: 100 }] },
      // In-range hourly buckets.
      {
        rows: [
          // Night band hour: rise from the 100 baseline, not from min_value.
          { bucket: new Date(2024, 5, 10, 3), metric: "imp_t", max_value: 102, min_value: 100.5 },
          // Standard-rate hour.
          { bucket: new Date(2024, 5, 10, 10), metric: "imp_t", max_value: 105, min_value: 102 },
          // No baseline for exp_t/load_t → first bucket falls back to max − min.
          { bucket: new Date(2024, 5, 10, 10), metric: "exp_t", max_value: 50, min_value: 46 },
          { bucket: new Date(2024, 5, 10, 10), metric: "load_t", max_value: 200, min_value: 190 },
          // Counter reset: max below the prior high → clamped to 0, not priced.
          { bucket: new Date(2024, 5, 10, 11), metric: "imp_t", max_value: 1, min_value: 0 },
          // Metric not mapped by the profile → ignored.
          { bucket: new Date(2024, 5, 10, 11), metric: "junk", max_value: 9, min_value: 0 },
        ],
      },
    ];

    const result = await computeCost(totalsProfile, {
      from: new Date(2024, 5, 10),
      to: new Date(2024, 5, 12),
    });

    expect(result.currency).toBe("EUR");
    expect(result.importKwh).toBeCloseTo(5, 9); // 2 (night) + 3 (day) + 0 (reset)
    expect(result.exportKwh).toBeCloseTo(4, 9);
    expect(result.loadKwh).toBeCloseTo(10, 9);
    expect(result.importCost).toBeCloseTo(2 * 0.1 + 3 * 0.3, 9);
    expect(result.exportEarnings).toBeCloseTo(4 * 0.08, 9);
    expect(result.gridOnlyCost).toBeCloseTo(10 * 0.3, 9);
    expect(result.standingCharge).toBeCloseTo(2, 9); // 2-day window
    expect(result.net).toBeCloseTo(1.1 - 0.32 + 2, 9);
    expect(result.selfConsumedKwh).toBeCloseTo(5, 9);
    expect(result.byBand.map((b) => b.name)).toEqual(["Standard", "Night"]);
    expect(result.byDay).toHaveLength(1);
  });

  test("today window reports the live *.today registers over the delta energies", async () => {
    await setTariff(tariffInput);
    const todayProfile = profileWith({
      "grid.energy.imported.total": "imp_t",
      "load.energy.total": "load_t",
      "grid.energy.imported.today": "imp_d",
      "load.energy.today": "load_d",
    });
    const now = new Date();
    liveState.set({
      time: now.toISOString(),
      inverterId: "inv-1",
      metrics: { imp_d: 7, load_d: 20 },
    });
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);

    // No rollup rows at all: the delta energies are zero, so anything non-zero
    // must come from the live-register override.
    const result = await computeCost(todayProfile, { from: midnight, to: now });
    expect(result.importKwh).toBe(7);
    expect(result.loadKwh).toBe(20);
    expect(result.selfConsumedKwh).toBe(13);
    expect(result.selfSufficiency).toBeCloseTo(0.65, 9);
    expect(result.selfConsumption).toBeNull(); // no production data
    // Money stays on the (zero) per-hour deltas — only the standing charge remains.
    expect(result.importCost).toBe(0);
  });

  test("a profile without energy roles yields zeros without querying", async () => {
    const result = await computeCost(profileWith({}), {
      from: new Date(2024, 5, 10),
      to: new Date(2024, 5, 11),
    });
    expect(executeCalls).toBe(0);
    expect(result.importKwh).toBe(0);
    expect(result.net).toBe(result.standingCharge);
  });
});

describe("computeCostSeries", () => {
  test("prices each period at its band and zero-fills the window", async () => {
    await setTariff(tariffInput);
    executeResults = [
      {
        rows: [
          { period: "2024-06-10T03", hod: 3, dow: 1, metric: "imp_t", kwh: 2 },
          { period: "2024-06-10T03", hod: 3, dow: 1, metric: "exp_t", kwh: 4 },
          // Load carries no money in the series → ignored.
          { period: "2024-06-10T03", hod: 3, dow: 1, metric: "load_t", kwh: 9 },
          // Edge-rounded row outside the zero-filled window → dropped.
          { period: "2099-01-01T00", hod: 0, dow: 1, metric: "imp_t", kwh: 5 },
        ],
      },
    ];

    const points = await computeCostSeries(totalsProfile, {
      from: new Date(2024, 5, 10, 3),
      to: new Date(2024, 5, 10, 5),
      bucket: "hour",
    });

    expect(points.map((p) => p.bucket)).toEqual(["2024-06-10T03", "2024-06-10T04"]);
    const hourStanding = 1 / 24; // one avg month per month ⇒ 1/day ⇒ 1/24 per hour
    expect(points[0]?.importCost).toBeCloseTo(0.2, 9); // 2 kWh in the Night band
    expect(points[0]?.exportEarnings).toBeCloseTo(0.32, 9);
    expect(points[0]?.standingCharge).toBeCloseTo(hourStanding, 9);
    expect(points[0]?.net).toBeCloseTo(0.2 - 0.32 + hourStanding, 9);
    // Zero-filled hour: only the prorated standing charge.
    expect(points[1]?.importCost).toBe(0);
    expect(points[1]?.net).toBeCloseTo(hourStanding, 9);
  });

  test("month buckets prorate the standing charge by window overlap", async () => {
    await setTariff(tariffInput);
    const points = await computeCostSeries(totalsProfile, {
      from: new Date(2024, 5, 15),
      to: new Date(2024, 7, 2),
      bucket: "month",
    });
    expect(points.map((p) => p.bucket)).toEqual(["2024-06", "2024-07", "2024-08"]);
    expect(points[0]?.standingCharge).toBeCloseTo(16, 6); // Jun 15 → Jul 1
    expect(points[1]?.standingCharge).toBeCloseTo(31, 6); // full July
    expect(points[2]?.standingCharge).toBeCloseTo(1, 6); // Aug 1 → Aug 2
  });

  test("day buckets step the local calendar", async () => {
    const points = await computeCostSeries(totalsProfile, {
      from: new Date(2024, 5, 10),
      to: new Date(2024, 5, 12),
      bucket: "day",
    });
    expect(points.map((p) => p.bucket)).toEqual(["2024-06-10", "2024-06-11"]);
  });
});

describe("fetchCounterDeltaMatrix", () => {
  test("short-circuits (no query) when the profile maps no energy roles", async () => {
    const matrix = await fetchCounterDeltaMatrix(profileWith({}), {
      from: new Date(2024, 5, 10),
      to: new Date(2024, 5, 11),
      bucket: "day",
    });
    expect(executeCalls).toBe(0);
    expect(matrix.rows).toEqual([]);
    expect(matrix.periods).toEqual(["2024-06-10"]);
  });
});

describe("currentPeriodKey", () => {
  const at = new Date(2024, 0, 5, 7);

  test("matches the SQL to_char masks per bucket", () => {
    expect(currentPeriodKey("hour", at)).toBe("2024-01-05T07");
    expect(currentPeriodKey("day", at)).toBe("2024-01-05");
    expect(currentPeriodKey("month", at)).toBe("2024-01");
  });

  test("defaults to the current time", () => {
    expect(currentPeriodKey("day")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
