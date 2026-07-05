import { describe, expect, test } from "bun:test";
import type { HourEnergy } from "./cost-calc";
import { emptyMonth, monthWindow, summarizeMonths } from "./energy-calc";

/** A day-bucket at a given local date, with energy figures. */
const day = (iso: string, e: Partial<Omit<HourEnergy, "time">>): HourEnergy => ({
  time: new Date(iso),
  import: 0,
  export: 0,
  load: 0,
  production: 0,
  ...e,
});

describe("summarizeMonths", () => {
  test("groups day-buckets by local calendar month, sorted ascending", () => {
    const r = summarizeMonths([
      day("2024-02-10T00:00:00", { load: 3 }),
      day("2024-01-05T00:00:00", { load: 1 }),
      day("2024-01-20T00:00:00", { load: 2 }),
    ]);
    expect(r.map((m) => m.month)).toEqual(["2024-01", "2024-02"]);
    expect(r[0]?.loadKwh).toBe(3); // 1 + 2
    expect(r[1]?.loadKwh).toBe(3);
  });

  test("splits consumption into grid vs solar and production into self vs export", () => {
    const m = summarizeMonths([
      day("2024-06-01T00:00:00", { import: 1, export: 4, load: 5, production: 10 }),
    ])[0]!;
    expect(m.gridToLoadKwh).toBe(1); // min(import, load)
    expect(m.solarToLoadKwh).toBe(4); // load - import
    expect(m.selfConsumedKwh).toBe(6); // production - export
    expect(m.exportedKwh).toBe(4);
    expect(m.selfSufficiency).toBeCloseTo((5 - 1) / 5, 6);
    expect(m.selfConsumption).toBeCloseTo((10 - 4) / 10, 6);
  });

  test("clamps when import exceeds load or export exceeds production", () => {
    const m = summarizeMonths([
      day("2024-06-01T00:00:00", { import: 8, export: 12, load: 5, production: 10 }),
    ])[0]!;
    expect(m.gridToLoadKwh).toBe(5); // capped at load
    expect(m.solarToLoadKwh).toBe(0); // never negative
    expect(m.selfConsumedKwh).toBe(0); // never negative
    expect(m.selfSufficiency).toBe(0);
    expect(m.selfConsumption).toBe(0);
  });

  test("null ratios when a month has no load or no production", () => {
    const m = summarizeMonths([day("2024-06-01T00:00:00", { import: 2 })])[0]!;
    expect(m.selfSufficiency).toBeNull();
    expect(m.selfConsumption).toBeNull();
  });

  test("empty input yields no months", () => {
    expect(summarizeMonths([])).toEqual([]);
  });
});

describe("monthWindow", () => {
  test("returns `months` keys ending at now, oldest first, spanning a year boundary", () => {
    const keys = monthWindow(12, new Date("2024-03-15T00:00:00"));
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2023-04");
    expect(keys.at(-1)).toBe("2024-03");
  });
});

describe("emptyMonth", () => {
  test("is all-zero with null ratios", () => {
    const m = emptyMonth("2024-01");
    expect(m).toMatchObject({
      month: "2024-01",
      loadKwh: 0,
      productionKwh: 0,
      gridToLoadKwh: 0,
      solarToLoadKwh: 0,
      selfConsumedKwh: 0,
      exportedKwh: 0,
      selfSufficiency: null,
      selfConsumption: null,
    });
  });
});
