import { describe, expect, test } from "bun:test";

import { genericSimulate } from "./generic-sim";
import type { CanonicalRole, InverterProfile, MetricDef, SimState } from "./types";

/** genericSimulate only reads key/role/index, so a partial metric suffices. */
const m = (key: string, role: CanonicalRole, index?: number) =>
  ({ key, role, index }) as unknown as MetricDef;

const profile: InverterProfile = {
  id: "test",
  name: "Test",
  manufacturer: "x",
  metrics: [
    m("pv1", "pv.string.power", 1),
    m("pv2", "pv.string.power", 2),
    m("pvtot", "pv.total.power"),
    m("bp", "battery.power"),
    m("soc", "battery.soc"),
    m("bv", "battery.voltage"),
    m("gp", "grid.power"),
    m("lp", "load.power"),
    m("prodDay", "production.today"),
    m("prodTot", "production.total"),
  ],
};

const NOON = new Date("2026-07-01T13:00:00");
const NIGHT = new Date("2026-07-01T02:00:00");

describe("genericSimulate", () => {
  test("produces PV at noon and none at night", () => {
    expect(genericSimulate(profile, { now: NOON, dtSec: 0, state: {} }).pvtot).toBeGreaterThan(0);
    expect(genericSimulate(profile, { now: NIGHT, dtSec: 0, state: {} }).pvtot).toBe(0);
  });

  test("pv.total.power equals the sum of the strings", () => {
    const out = genericSimulate(profile, { now: NOON, dtSec: 0, state: {} });
    // Each string and the total are rounded independently, so allow ±1 W slack.
    expect(Math.abs(out.pvtot! - (out.pv1! + out.pv2!))).toBeLessThanOrEqual(2);
  });

  test("respects energy balance: grid = load + battery - pv", () => {
    const out = genericSimulate(profile, { now: NOON, dtSec: 0, state: {} });
    expect(Math.abs(out.gp! - (out.lp! + out.bp! - out.pvtot!))).toBeLessThan(3);
  });

  test("keeps SoC within bounds and integrates it over time", () => {
    const state: SimState = {};
    genericSimulate(profile, { now: NIGHT, dtSec: 0, state }); // init → soc 58
    const start = state.soc!;
    // Advance an hour of night: no PV, load draws the battery down.
    genericSimulate(profile, { now: NIGHT, dtSec: 3600, state });
    expect(state.soc!).toBeLessThan(start);
    expect(state.soc!).toBeGreaterThanOrEqual(15);
    expect(state.soc!).toBeLessThanOrEqual(100);
  });

  test("accumulates energy counters over elapsed time", () => {
    const state: SimState = {};
    genericSimulate(profile, { now: NOON, dtSec: 0, state });
    const before = state.productionTotal!;
    const out = genericSimulate(profile, { now: NOON, dtSec: 3600, state });
    expect(state.productionTotal!).toBeGreaterThan(before);
    expect(out.prodTot!).toBeGreaterThan(0);
  });

  test("works for a battery-less profile (grid balances everything)", () => {
    const pvOnly: InverterProfile = {
      id: "pv",
      name: "PV",
      manufacturer: "x",
      metrics: [m("pvtot", "pv.total.power"), m("gp", "grid.power"), m("lp", "load.power")],
    };
    const out = genericSimulate(pvOnly, { now: NOON, dtSec: 0, state: {} });
    expect(out.soc).toBeUndefined();
    expect(Math.abs(out.gp! - (out.lp! - out.pvtot!))).toBeLessThan(3);
  });
});
