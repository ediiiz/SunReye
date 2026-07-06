import { describe, expect, test } from "bun:test";

import { defineProfile, metric } from "./define";
import { compileComputeExpr, hydrateProfile, type ProfileData } from "./profile-data";
import { ROLE_CATALOG, ROLE_NAMES } from "./roles";
import { profileDataSchema, safeParseProfileData } from "./schema";

/** A minimal valid profile built via the SDK, reused across cases. */
function goodProfile(): ProfileData {
  return defineProfile({
    id: "test-inv",
    name: "Test Inverter",
    manufacturer: "ACME",
    version: "1.0.0",
    metrics: [
      metric("dc/pv1/power", {
        label: "PV1",
        unit: "W",
        group: "inverter",
        addr: 672,
        role: "pv.string.power",
        index: 1,
      }),
      metric("dc/pv2/power", {
        label: "PV2",
        unit: "W",
        group: "inverter",
        addr: 673,
        role: "pv.string.power",
        index: 2,
      }),
      metric("battery/soc", {
        label: "SOC",
        unit: "%",
        group: "battery",
        addr: 588,
        role: "battery.soc",
      }),
      metric("inverter/status", {
        label: "Status",
        group: "inverter",
        addr: 500,
        role: "inverter.status",
        enumLabels: { 0: "Standby", 2: "Normal" },
      }),
      metric("settings/workmode", {
        label: "Work Mode",
        group: "settings",
        addr: 142,
        access: "rw",
        role: "setting.work_mode",
        enumLabels: { 0: "Selling First" },
      }),
      metric("dc/total_power", {
        label: "PV Total",
        unit: "W",
        group: "inverter",
        role: "pv.total.power",
        computeExpr: { sum: ["dc.pv1.power", "dc.pv2.power"] },
      }),
    ],
  });
}

describe("role catalog", () => {
  test("CanonicalRole vocabulary is complete and lists the expected roles", () => {
    // Guards against accidental deletion when editing the catalog.
    expect(ROLE_NAMES.length).toBe(46);
    for (const r of [
      "pv.string.power",
      "battery.power",
      "grid.power",
      "setting.work_mode",
      "inverter.power",
      "inverter.efficiency",
    ] as const) {
      expect(ROLE_CATALOG[r]).toBeDefined();
    }
  });

  test("indexed / writable / enum flags are set for representative roles", () => {
    expect(ROLE_CATALOG["pv.string.power"].indexed).toBe(true);
    expect(ROLE_CATALOG["setting.work_mode"].writable).toBe(true);
    expect(ROLE_CATALOG["inverter.status"].needsEnumLabels).toBe(true);
    expect(ROLE_CATALOG["battery.power"].signed).toBe(true);
  });
});

describe("metric() builder defaults", () => {
  test("derives key from topic and applies defaults", () => {
    const m = metric("ac/l1/power", { label: "L1", group: "inverter", addr: 633, type: "S_WORD" });
    expect(m.key).toBe("ac.l1.power");
    expect(m.type).toBe("S_WORD");
    expect(m.scale).toBe(1);
    expect(m.access).toBe("r");
    expect(m.unit).toBeNull();
    expect(m.addresses).toEqual([633]);
  });

  test("addressless computed metric", () => {
    const m = metric("dc/total_power", {
      label: "Total",
      group: "inverter",
      computeExpr: { sum: ["a", "b"] },
    });
    expect(m.addresses).toEqual([]);
    expect(m.computeExpr).toEqual({ sum: ["a", "b"] });
  });
});

describe("profileDataSchema", () => {
  test("accepts a well-formed profile", () => {
    expect(profileDataSchema.safeParse(goodProfile()).success).toBe(true);
  });

  test("rejects duplicate metric keys", () => {
    const p = goodProfile();
    p.metrics.push({ ...p.metrics[1]!, addresses: [999] }); // same key as pv2
    expect(safeParseProfileData(p).success).toBe(false);
  });

  test("rejects duplicate wire addresses", () => {
    const p = goodProfile();
    p.metrics[2]!.addresses = [672]; // clash with pv1 power
    expect(safeParseProfileData(p).success).toBe(false);
  });

  test("rejects an indexed role without index", () => {
    const p = goodProfile();
    delete p.metrics[0]!.index;
    expect(safeParseProfileData(p).success).toBe(false);
  });

  test("rejects an enum role without enumLabels", () => {
    const p = goodProfile();
    delete p.metrics[3]!.enumLabels;
    expect(safeParseProfileData(p).success).toBe(false);
  });

  test("rejects a writable role that is not rw", () => {
    const p = goodProfile();
    p.metrics[4]!.access = "r";
    expect(safeParseProfileData(p).success).toBe(false);
  });

  test("rejects a U_DWORD without exactly two addresses", () => {
    const p = goodProfile();
    p.metrics[2]!.type = "U_DWORD"; // soc has a single address
    expect(safeParseProfileData(p).success).toBe(false);
  });

  test("rejects computeExpr referencing an unknown key", () => {
    const p = goodProfile();
    p.metrics[5]!.computeExpr = { sum: ["dc.pv1.power", "does.not.exist"] };
    expect(safeParseProfileData(p).success).toBe(false);
  });

  test("rejects computeExpr forward-referencing a later computed metric", () => {
    const p = goodProfile();
    // total (computed) references a computed metric declared after it
    p.metrics.push(
      metric("dc/derived", {
        label: "D",
        group: "inverter",
        computeExpr: { scale: ["dc.total_power", 2] },
      }),
    );
    p.metrics[5]!.computeExpr = { sum: ["dc.derived"] };
    expect(safeParseProfileData(p).success).toBe(false);
  });

  test("rejects unknown top-level keys (strict)", () => {
    const p = { ...goodProfile(), rogue: true };
    expect(safeParseProfileData(p).success).toBe(false);
  });
});

describe("hydrateProfile", () => {
  test("compiles computeExpr into a working compute closure", () => {
    const profile = hydrateProfile(goodProfile());
    const total = profile.metrics.find((m) => m.key === "dc.total_power");
    expect(total?.compute).toBeInstanceOf(Function);
    expect(total?.compute?.({ "dc.pv1.power": 100, "dc.pv2.power": 250 })).toBe(350);
  });

  test("carries an injected simulate hook and drops data-only fields", () => {
    const sim = () => ({});
    const profile = hydrateProfile(goodProfile(), { simulate: sim });
    expect(profile.simulate).toBe(sim);
    expect("schemaVersion" in profile).toBe(false);
    expect("version" in profile).toBe(false);
  });
});

describe("compileComputeExpr", () => {
  test("sum / diff / scale", () => {
    expect(compileComputeExpr({ sum: ["a", "b", "c"] })({ a: 1, b: 2, c: 3 })).toBe(6);
    expect(compileComputeExpr({ diff: ["a", "b"] })({ a: 10, b: 4 })).toBe(6);
    expect(compileComputeExpr({ scale: ["a", 0.1] })({ a: 50 })).toBe(5);
    expect(compileComputeExpr({ sum: ["a", "missing"] })({ a: 1 })).toBe(1);
  });

  test("combine sums adds minus subs, missing keys read as 0", () => {
    const f = compileComputeExpr({ combine: { add: ["a", "b"], sub: ["c"] } });
    expect(f({ a: 100, b: -40, c: 20 })).toBe(40);
    expect(compileComputeExpr({ combine: { add: ["a"] } })({ a: 7 })).toBe(7);
    expect(f({ a: 10 })).toBe(10);
  });

  test("ratio scales the num/den quotient, guarding a zero denominator", () => {
    const eff = compileComputeExpr({ ratio: { num: ["load"], den: ["a", "b"], scale: 100 } });
    expect(eff({ load: 900, a: 1000, b: 0 })).toBe(90);
    expect(eff({ load: 900, a: 0, b: 0 })).toBe(0);
    expect(compileComputeExpr({ ratio: { num: ["a"], den: ["b"] } })({ a: 3, b: 4 })).toBe(0.75);
  });
});
