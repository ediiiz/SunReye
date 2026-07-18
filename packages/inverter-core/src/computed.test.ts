import { describe, expect, test } from "bun:test";

import { applyComputed } from "./computed";
import type { MetricDef, MetricValues } from "./types";

/** Minimal computed metric with an arbitrary compute closure. */
const computed = (key: string, compute: (v: MetricValues) => number, range?: MetricDef["range"]) =>
  ({
    key,
    topic: key,
    label: key,
    unit: null,
    group: "test",
    type: "RO",
    addresses: [],
    scale: 1,
    access: "r",
    compute,
    range,
  }) as unknown as MetricDef;

describe("applyComputed", () => {
  test("writes the raw compute result when no range is declared", () => {
    const values: MetricValues = { a: 5 };
    applyComputed([computed("x", (v) => v.a * 40)], values);
    expect(values.x).toBe(200);
  });

  test("clamps a range-annotated computed metric to its bounds", () => {
    const eff = computed("eff", (v) => v.ratio, { min: 0, max: 100 });

    const over: MetricValues = { ratio: 250 };
    applyComputed([eff], over);
    expect(over.eff).toBe(100);

    const under: MetricValues = { ratio: -30 };
    applyComputed([eff], under);
    expect(under.eff).toBe(0);

    const within: MetricValues = { ratio: 42 };
    applyComputed([eff], within);
    expect(within.eff).toBe(42);
  });

  test("non-computed metrics are left untouched", () => {
    const plain = { key: "p", compute: undefined } as unknown as MetricDef;
    const values: MetricValues = { p: 1 };
    applyComputed([plain], values);
    expect(values.p).toBe(1);
  });
});
