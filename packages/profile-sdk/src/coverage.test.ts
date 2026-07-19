import { describe, expect, test } from "bun:test";

import { defineProfile, metric, ROLE_NAMES, type MetricDataDef } from "@SunReye/inverter-core";

import { coverage, groupByPrefix, isIndexedRole, suggestAggregates } from "./coverage";

const pv = (n: number): MetricDataDef =>
  metric(`dc/pv${n}/power`, {
    label: `PV${n} Power`,
    group: "solar",
    unit: "W",
    role: "pv.string.power",
    index: n,
    addr: 670 + n,
  });

const total = (sum: string[]): MetricDataDef =>
  metric("dc/total_power", {
    label: "PV Total",
    group: "solar",
    unit: "W",
    role: "pv.total.power",
    computeExpr: { sum },
  });

const profile = (metrics: MetricDataDef[]) =>
  defineProfile({ id: "acme", name: "Acme", manufacturer: "Acme", version: "1.0.0", metrics });

describe("coverage", () => {
  test("splits the role catalog into mapped and missing", () => {
    const report = coverage(profile([pv(1), pv(2)]));
    expect(report.total).toBe(ROLE_NAMES.length);
    expect(report.mapped).toEqual(["pv.string.power"]); // dedupes the two strings
    expect(report.mappedCount).toBe(1);
    expect(report.missing).toHaveLength(ROLE_NAMES.length - 1);
    expect(report.missing).not.toContain("pv.string.power");
  });

  test("ignores metrics without a role", () => {
    const plain = metric("misc/raw", { label: "Raw", group: "solar", addr: 1 });
    const report = coverage(profile([plain]));
    expect(report.mappedCount).toBe(0);
    expect(report.missing).toEqual([...ROLE_NAMES]);
  });
});

describe("groupByPrefix", () => {
  test("groups roles by their leading segment, preserving order", () => {
    const groups = groupByPrefix(["pv.string.power", "battery.soc", "pv.total.power"]);
    expect([...groups.keys()]).toEqual(["pv", "battery"]);
    expect(groups.get("pv")).toEqual(["pv.string.power", "pv.total.power"]);
    expect(groups.get("battery")).toEqual(["battery.soc"]);
  });

  test("returns an empty map for no roles", () => {
    expect(groupByPrefix([]).size).toBe(0);
  });
});

describe("isIndexedRole", () => {
  test("distinguishes per-string/phase roles from scalar ones", () => {
    expect(isIndexedRole("pv.string.power")).toBe(true);
    expect(isIndexedRole("grid.phase.voltage")).toBe(true);
    expect(isIndexedRole("battery.soc")).toBe(false);
  });
});

describe("suggestAggregates", () => {
  test("suggests sumOf when a sum covers exactly an indexed role group", () => {
    const data = profile([pv(1), pv(2), total(["dc.pv1.power", "dc.pv2.power"])]);
    expect(suggestAggregates(data)).toEqual([
      { key: "dc.total_power", role: "pv.string.power", count: 2 },
    ]);
  });

  test("no suggestion when the sum is only a subset of the role group", () => {
    const data = profile([pv(1), pv(2), pv(3), total(["dc.pv1.power", "dc.pv2.power"])]);
    expect(suggestAggregates(data)).toEqual([]);
  });

  test("no suggestion for a single-key sum (not worth an aggregate)", () => {
    const data = profile([pv(1), total(["dc.pv1.power"])]);
    expect(suggestAggregates(data)).toEqual([]);
  });

  test("ignores sums over a non-indexed role (not a per-SKU varying group)", () => {
    const today = metric("ac/daily_bought", {
      label: "Bought today",
      group: "grid",
      unit: "kWh",
      role: "grid.energy.imported.today",
      addr: 520,
    });
    // A contrived sum over a non-indexed role: still no suggestion.
    const data = profile([
      today,
      metric("derived/x", { label: "X", group: "grid", computeExpr: { sum: ["ac.daily_bought"] } }),
    ]);
    expect(suggestAggregates(data)).toEqual([]);
  });
});
