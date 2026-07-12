import { describe, expect, test } from "bun:test";

import { entityConstraint, hydrateProfile, metricByKey } from "@SunReye/inverter-core";
import type { ProfileData } from "@SunReye/inverter-core";

import { deyeSg05lp3Family } from "./index";

/**
 * Mirror of the server's `validateWrite` numeric-bound check (apps/server
 * `inverter.ts`), driven by the same `entityConstraint` metadata — so this
 * asserts the per-model `range` is enforced end to end without pulling the
 * server's env/db module graph into a unit test.
 */
function validateWrite(profile: ProfileData, key: string, value: number): string | null {
  const def = metricByKey(hydrateProfile(profile)).get(key);
  if (!def) return `Unknown entity: ${key}`;
  const c = entityConstraint(def);
  if (!c.writable) return `Entity is not writable: ${key}`;
  if (c.min !== undefined && value < c.min) return `Value ${value} is below minimum ${c.min}`;
  if (c.max !== undefined && value > c.max) return `Value ${value} is above maximum ${c.max}`;
  return null;
}

const model = (id: string): ProfileData => {
  const p = deyeSg05lp3Family.find((m) => m.id === id);
  if (!p) throw new Error(`no such model: ${id}`);
  return p;
};

const DISCHARGE = "settings.battery.maximum_discharge_current";

describe("per-model battery discharge ceiling is enforced end to end", () => {
  test("SUN-15K caps max discharge at 280 A", () => {
    const sun15k = model("deye-sun15k-sg05lp3");
    expect(validateWrite(sun15k, DISCHARGE, 280)).toBeNull();
    expect(validateWrite(sun15k, DISCHARGE, 300)).toMatch(/above maximum 280/);
  });

  test("each datasheet SKU enforces its own charge/discharge ceiling", () => {
    const ceilings: Record<string, number> = {
      "deye-sun14k-sg05lp3": 260,
      "deye-sun15k-sg05lp3": 280,
      "deye-sun16k-sg05lp3": 300,
      "deye-sun18k-sg05lp3": 330,
      "deye-sun20k-sg05lp3": 350,
    };
    for (const [id, max] of Object.entries(ceilings)) {
      const p = model(id);
      expect(validateWrite(p, DISCHARGE, max)).toBeNull();
      expect(validateWrite(p, DISCHARGE, max + 1)).toMatch(new RegExp(`above maximum ${max}`));
      // Charge shares the same ceiling on this family.
      expect(validateWrite(p, "settings.battery.maximum_charge_current", max + 1)).toMatch(
        new RegExp(`above maximum ${max}`),
      );
    }
  });

  test("the smallest SKU (260 A) is tighter than the generic base envelope (350 A)", () => {
    expect(validateWrite(model("deye-sun14k-sg05lp3"), DISCHARGE, 300)).toMatch(
      /above maximum 260/,
    );
    // The same write is within bounds on the generic fallback profile.
    expect(validateWrite(model("deye-sg05lp3"), DISCHARGE, 300)).toBeNull();
  });
});
