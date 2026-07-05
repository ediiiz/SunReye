import { describe, expect, test } from "bun:test";

import { buildManifest, deriveCapabilities, safeParseProfileData } from "@SunReye/inverter-core";

import golden from "./__fixtures__/golden.json";
import { deyeSunsynk, deyeSunsynkData } from "./index";

/** JSON round-trip drops `undefined` keys so the two shapes compare cleanly. */
const clean = (v: unknown) => JSON.parse(JSON.stringify(v));

/** Structural view of a hydrated metric: the compute closure → a stable marker. */
const metricShape = (m: (typeof deyeSunsynk.metrics)[number]) =>
  clean({ ...m, compute: m.compute ? "fn" : undefined });

describe("Deye profile SDK refactor — golden equivalence", () => {
  test("manifest is byte-equivalent to the pre-refactor baseline", () => {
    expect(clean(buildManifest(deyeSunsynk))).toEqual(golden.manifest);
  });

  test("capabilities are byte-equivalent", () => {
    expect(clean(deriveCapabilities(deyeSunsynk))).toEqual(golden.capabilities);
  });

  test("every metric matches the baseline (register map + semantics)", () => {
    expect(deyeSunsynk.metrics.map(metricShape)).toEqual(golden.metrics);
  });

  test("the computed dc.total_power still sums the two PV strings", () => {
    const total = deyeSunsynk.metrics.find((m) => m.key === "dc.total_power");
    expect(total?.compute?.({ "dc.pv1.power": 100, "dc.pv2.power": 200 })).toBe(golden.computeSample);
  });
});

describe("Deye ProfileData is a valid downloadable profile", () => {
  test("passes the strict profileDataSchema validator", () => {
    const result = safeParseProfileData(deyeSunsynkData);
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });
});
