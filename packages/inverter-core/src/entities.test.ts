import { describe, expect, test } from "bun:test";

import { entityConstraint, metricByKey, writableMetrics } from "./entities";
import type { InverterProfile, MetricDef } from "./types";

const def = (over: Partial<MetricDef> & { key: string }): MetricDef => ({
  topic: over.key.replaceAll(".", "/"),
  label: over.key,
  unit: null,
  group: "test",
  type: "U_WORD",
  addresses: [100],
  scale: 1,
  access: "r",
  ...over,
});

describe("entityConstraint", () => {
  test("enum metric exposes its raw enumLabels keys as permitted values", () => {
    const c = entityConstraint(
      def({
        key: "settings.work_mode",
        access: "rw",
        enumLabels: { 0: "Selling First", 1: "Zero Export", 2: "Limited to Load" },
      }),
    );
    expect(c).toEqual({ writable: true, valueType: "enum", enumValues: [0, 1, 2] });
  });

  test("ranged rw number carries the profile's bounds", () => {
    const c = entityConstraint(
      def({ key: "settings.max_discharge", access: "rw", range: { min: 0, max: 300 } }),
    );
    expect(c).toEqual({ writable: true, valueType: "number", min: 0, max: 300 });
  });

  test("rangeless read-only number is an unbounded, non-writable number", () => {
    const c = entityConstraint(def({ key: "dc.pv1.power" }));
    expect(c.writable).toBe(false);
    expect(c.valueType).toBe("number");
    expect(c.min).toBeUndefined();
    expect(c.max).toBeUndefined();
  });

  test("RAW registers are never writable, even with rw access", () => {
    const c = entityConstraint(
      def({ key: "settings.system_time", access: "rw", type: "RAW", addresses: [22, 23, 24] }),
    );
    expect(c.writable).toBe(false);
  });
});

describe("writableMetrics / metricByKey", () => {
  const profile: InverterProfile = {
    id: "entities-test",
    name: "Entities Test",
    manufacturer: "Test",
    metrics: [
      def({ key: "dc.pv1.power" }),
      def({ key: "settings.max_discharge", access: "rw" }),
      def({ key: "settings.system_time", access: "rw", type: "RAW", addresses: [22, 23] }),
    ],
  };

  test("writableMetrics keeps only rw non-RAW metrics", () => {
    expect(writableMetrics(profile).map((m) => m.key)).toEqual(["settings.max_discharge"]);
  });

  test("metricByKey indexes every metric by canonical key", () => {
    const index = metricByKey(profile);
    expect(index.size).toBe(3);
    expect(index.get("dc.pv1.power")?.addresses).toEqual([100]);
    expect(index.get("nope")).toBeUndefined();
  });
});
