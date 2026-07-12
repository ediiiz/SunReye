import { describe, expect, test } from "bun:test";

import { deriveCapabilities } from "./capabilities";
import { defineFamily, defineProfile, defineVariant, metric } from "./define";
import { hydrateProfile, type ProfileData } from "./profile-data";
import { safeParseProfileData } from "./schema";

/** A base with 2 PV strings, a ranged writable setting, and a computed PV total. */
function base(): ProfileData {
  return defineProfile({
    id: "acme-hybrid",
    name: "Acme Hybrid",
    manufacturer: "Acme",
    version: "1.0.0",
    metrics: [
      metric("dc/pv1/power", {
        label: "PV1 Power",
        unit: "W",
        group: "solar",
        addr: 672,
        role: "pv.string.power",
        index: 1,
      }),
      metric("dc/pv2/power", {
        label: "PV2 Power",
        unit: "W",
        group: "solar",
        addr: 673,
        role: "pv.string.power",
        index: 2,
      }),
      metric("dc/pv2/voltage", {
        label: "PV2 Voltage",
        unit: "V",
        group: "solar",
        addr: 678,
        scale: 0.1,
        role: "pv.string.voltage",
        index: 2,
      }),
      metric("settings/battery/maximum_discharge_current", {
        label: "Max battery discharge current",
        unit: "A",
        group: "settings",
        addr: 109,
        access: "rw",
        role: "setting.battery.max_discharge_current",
        range: { min: 0, max: 300 },
      }),
      metric("dc/total_power", {
        label: "PV Total",
        unit: "W",
        group: "solar",
        role: "pv.total.power",
        computeExpr: { sum: ["dc.pv1.power", "dc.pv2.power"] },
      }),
    ],
  });
}

const byKey = (p: ProfileData, key: string) => p.metrics.find((m) => m.key === key);

describe("defineVariant — patch", () => {
  test("max/min shorthand writes a range, merging over an existing one", () => {
    const v = defineVariant(base(), {
      id: "acme-15k",
      metrics: { "settings.battery.maximum_discharge_current": { max: 280 } },
    });
    expect(byKey(v, "settings.battery.maximum_discharge_current")?.range).toEqual({
      min: 0,
      max: 280,
    });
  });

  test("min alone keeps the existing max", () => {
    const v = defineVariant(base(), {
      id: "acme-x",
      metrics: { "settings.battery.maximum_discharge_current": { min: 20 } },
    });
    expect(byKey(v, "settings.battery.maximum_discharge_current")?.range).toEqual({
      min: 20,
      max: 300,
    });
  });

  test("max on a metric with no range creates one (min defaults to 0)", () => {
    const v = defineVariant(base(), {
      id: "acme-x",
      metrics: { "dc.pv1.power": { max: 6000 } },
    });
    expect(byKey(v, "dc.pv1.power")?.range).toEqual({ min: 0, max: 6000 });
  });

  test("addr / scale patch updates addresses and scale, keeping other fields", () => {
    const v = defineVariant(base(), {
      id: "acme-x",
      metrics: { "dc.pv1.power": { addr: 680, scale: 0.01 } },
    });
    const m = byKey(v, "dc.pv1.power");
    expect(m?.addresses).toEqual([680]);
    expect(m?.scale).toBe(0.01);
    expect(m?.label).toBe("PV1 Power"); // untouched
    expect(m?.role).toBe("pv.string.power");
  });
});

describe("defineVariant — remove", () => {
  test("null removes an exact key", () => {
    const v = defineVariant(base(), {
      id: "acme-x",
      metrics: { "dc.pv2.voltage": null },
    });
    expect(byKey(v, "dc.pv2.voltage")).toBeUndefined();
    expect(byKey(v, "dc.pv2.power")).toBeDefined();
  });

  test("trailing .* wildcard removes every metric under the prefix", () => {
    const v = defineVariant(base(), {
      id: "acme-5k",
      metrics: {
        "dc.pv2.*": null,
        "dc.total_power": { computeExpr: { sum: ["dc.pv1.power"] } },
      },
    });
    expect(byKey(v, "dc.pv2.power")).toBeUndefined();
    expect(byKey(v, "dc.pv2.voltage")).toBeUndefined();
    expect(byKey(v, "dc.pv1.power")).toBeDefined();
    // Removing a PV string drops it from derived capabilities.
    expect(deriveCapabilities(hydrateProfile(v)).pvStrings).toBe(1);
  });
});

describe("defineVariant — add", () => {
  test("unknown key + full definition adds a metric with topic derived from the key", () => {
    const v = defineVariant(base(), {
      id: "acme-20k",
      metrics: {
        "dc.pv3.power": {
          label: "PV3 Power",
          unit: "W",
          group: "solar",
          addr: 674,
          role: "pv.string.power",
          index: 3,
        },
      },
    });
    const m = byKey(v, "dc.pv3.power");
    expect(m).toBeDefined();
    expect(m?.topic).toBe("dc/pv3/power"); // dots → slashes
    expect(m?.addresses).toEqual([674]);
    // Added last, after the kept base metrics.
    expect(v.metrics.at(-1)?.key).toBe("dc.pv3.power");
    expect(deriveCapabilities(hydrateProfile(v)).pvStrings).toBe(3);
  });
});

describe("defineVariant — guards", () => {
  test("patching a key absent from the base throws", () => {
    expect(() =>
      defineVariant(base(), { id: "x", metrics: { "no.such.key": { scale: 2 } } }),
    ).toThrow(/no such metric/);
  });

  test("a wildcard matching zero metrics throws", () => {
    expect(() => defineVariant(base(), { id: "x", metrics: { "nope.*": null } })).toThrow(
      /matched no metrics/,
    );
  });

  test("an incomplete add (partial object on an unknown key) throws", () => {
    expect(() =>
      defineVariant(base(), { id: "x", metrics: { "dc.pv9.power": { unit: "W" } } }),
    ).toThrow(/full definition/);
  });

  test("does not mutate the base across derivations", () => {
    const b = base();
    const before = structuredClone(b);
    defineVariant(b, { id: "a", metrics: { "dc.pv2.*": null } });
    defineVariant(b, {
      id: "b",
      metrics: { "settings.battery.maximum_discharge_current": { max: 100 } },
    });
    expect(b).toEqual(before);
  });
});

describe("defineFamily", () => {
  const family = defineFamily({
    id: "acme-hybrid",
    name: "Acme Hybrid",
    manufacturer: "Acme",
    version: "1.0.0",
    metrics: base().metrics,
    models: {
      "acme-5k": {
        name: "Acme 5K",
        metrics: {
          "dc.pv2.*": null,
          "dc.total_power": { computeExpr: { sum: ["dc.pv1.power"] } },
          "settings.battery.maximum_discharge_current": { max: 120 },
        },
      },
      "acme-15k": {
        name: "Acme 15K",
        metrics: { "settings.battery.maximum_discharge_current": { max: 280 } },
      },
    },
  });

  test("returns the generic base first, then one profile per model keyed by id", () => {
    expect(family.map((p) => p.id)).toEqual(["acme-hybrid", "acme-5k", "acme-15k"]);
    expect(family[0]?.name).toBe("Acme Hybrid");
    expect(family[1]?.name).toBe("Acme 5K");
  });

  test("models inherit version + manufacturer from the base", () => {
    for (const p of family) {
      expect(p.version).toBe("1.0.0");
      expect(p.manufacturer).toBe("Acme");
    }
  });

  test("every emitted profile is a valid downloadable profile", () => {
    for (const p of family) {
      const r = safeParseProfileData(p);
      if (!r.success) console.error(p.id, r.error.issues);
      expect(r.success).toBe(true);
    }
  });

  test("per-model limits land on the setting range", () => {
    const disMax = (id: string) =>
      byKey(family.find((p) => p.id === id)!, "settings.battery.maximum_discharge_current")?.range
        ?.max;
    expect(disMax("acme-hybrid")).toBe(300);
    expect(disMax("acme-5k")).toBe(120);
    expect(disMax("acme-15k")).toBe(280);
  });
});
