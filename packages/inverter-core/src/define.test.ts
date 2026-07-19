import { describe, expect, test } from "bun:test";

import { control, defineProfile, defineVariant, metric, sumOf } from "./define";
import type { ComputeExpr, ProfileData } from "./profile-data";

/**
 * Overlay guard + compute-pruning edge cases that `family.test.ts` doesn't hit:
 * removal of survivors referenced by scale/clamp/combine/ratio exprs, preset
 * control targets, and the wildcard/remove misuse errors.
 */

/** Base with four plain operands and one computed metric carrying `expr`. */
function withExpr(expr: ComputeExpr): ProfileData {
  return defineProfile({
    id: "acme-expr",
    name: "x",
    manufacturer: "x",
    version: "1.0.0",
    metrics: [
      metric("a/x", { label: "A", unit: "W", group: "g", addr: 1 }),
      metric("b/y", { label: "B", unit: "W", group: "g", addr: 2 }),
      metric("c/z", { label: "C", unit: "W", group: "g", addr: 3 }),
      metric("d/w", { label: "D", unit: "W", group: "g", addr: 4 }),
      metric("calc", { label: "Calc", unit: "W", group: "g", computeExpr: expr }),
    ],
  });
}

const calcExpr = (p: ProfileData) => p.metrics.find((m) => m.key === "calc")?.computeExpr;
const drop = (base: ProfileData, ...keys: string[]) =>
  defineVariant(base, {
    id: "acme-expr-variant",
    metrics: Object.fromEntries(keys.map((k) => [k, null])),
  });

describe("defineVariant — overlay misuse guards", () => {
  test("removing an exact key absent from the base throws", () => {
    expect(() => drop(withExpr({ sum: ["a.x"] }), "no.such.key")).toThrow(
      /cannot remove "no\.such\.key"/,
    );
  });

  test("a wildcard entry carrying a value (not null) throws", () => {
    expect(() =>
      defineVariant(withExpr({ sum: ["a.x"] }), {
        id: "x",
        metrics: { "a.*": { scale: 2 } },
      }),
    ).toThrow(/wildcard "a\.\*" must be null/);
  });
});

describe("defineVariant — pruning fixed-arity compute exprs", () => {
  test("removing the key of a scale expr throws", () => {
    expect(() => drop(withExpr({ scale: ["a.x", 2] }), "a.x")).toThrow(/fixed-arity scale/);
  });

  test("removing the key of a clamp expr throws", () => {
    expect(() => drop(withExpr({ clamp: { key: "a.x", min: 0 } }), "a.x")).toThrow(
      /single-key clamp/,
    );
  });

  test("scale/clamp/diff exprs pass through untouched when unaffected", () => {
    for (const expr of [
      { scale: ["a.x", 2] },
      { clamp: { key: "a.x", min: 0 } },
      { diff: ["a.x", "b.y"] },
      { sum: ["a.x", "b.y"] },
    ] satisfies ComputeExpr[]) {
      expect(calcExpr(drop(withExpr(expr), "d.w"))).toEqual(expr);
    }
  });
});

describe("defineVariant — pruning combine exprs", () => {
  const combined: ComputeExpr = { combine: { add: ["a.x", "b.y"], sub: ["c.z"] } };

  test("a removed add key is pruned, keeping sub", () => {
    expect(calcExpr(drop(withExpr(combined), "b.y"))).toEqual({
      combine: { add: ["a.x"], sub: ["c.z"] },
    });
  });

  test("removing every sub key drops the sub list entirely", () => {
    expect(calcExpr(drop(withExpr(combined), "c.z"))).toEqual({
      combine: { add: ["a.x", "b.y"] },
    });
  });

  test("removing every add key throws instead of emptying the mix", () => {
    expect(() => drop(withExpr(combined), "a.x", "b.y")).toThrow(/empties combine\.add/);
  });

  test("unaffected combine passes through untouched", () => {
    expect(calcExpr(drop(withExpr(combined), "d.w"))).toEqual(combined);
  });
});

describe("defineVariant — pruning ratio exprs", () => {
  const ratio: ComputeExpr = { ratio: { num: ["a.x", "b.y"], den: ["c.z", "d.w"], scale: 100 } };

  test("a removed num key is pruned, preserving the scale", () => {
    expect(calcExpr(drop(withExpr(ratio), "b.y"))).toEqual({
      ratio: { num: ["a.x"], den: ["c.z", "d.w"], scale: 100 },
    });
  });

  test("a scaleless ratio stays scaleless after pruning", () => {
    const bare: ComputeExpr = { ratio: { num: ["a.x"], den: ["c.z", "d.w"] } };
    expect(calcExpr(drop(withExpr(bare), "d.w"))).toEqual({
      ratio: { num: ["a.x"], den: ["c.z"] },
    });
  });

  test("removing every den key throws (a constant-0 denominator would lie)", () => {
    expect(() => drop(withExpr(ratio), "c.z", "d.w")).toThrow(/empties ratio\.den/);
  });

  test("removing every num key throws", () => {
    expect(() => drop(withExpr(ratio), "a.x", "b.y")).toThrow(/empties ratio\.num/);
  });

  test("unaffected ratio passes through untouched", () => {
    const other: ComputeExpr = { ratio: { num: ["a.x"], den: ["b.y"], scale: 100 } };
    expect(calcExpr(drop(withExpr(other), "d.w"))).toEqual(other);
  });
});

describe("defineVariant — preset control targets", () => {
  function withPreset(): ProfileData {
    return defineProfile({
      id: "acme-preset",
      name: "x",
      manufacturer: "x",
      version: "1.0.0",
      metrics: [
        metric("settings/limit", {
          label: "Limit",
          unit: "%",
          group: "settings",
          addr: 10,
          access: "rw",
        }),
        metric("settings/mode", {
          label: "Mode",
          unit: null,
          group: "settings",
          addr: 11,
          access: "rw",
        }),
        control("settings/eco", {
          label: "Eco preset",
          group: "settings",
          controlExpr: {
            preset: {
              writes: [
                { target: "settings.limit", value: 40 },
                { target: "settings.mode", value: 1 },
              ],
            },
          },
        }),
      ],
    });
  }

  test("removing any preset target throws", () => {
    expect(() =>
      defineVariant(withPreset(), { id: "x", metrics: { "settings.mode": null } }),
    ).toThrow(/control "settings\.eco" targets it/);
  });

  test("the control survives removals it does not target", () => {
    const base = withPreset();
    const extra = defineVariant(base, {
      id: "x",
      metrics: {
        "settings.spare": { label: "Spare", group: "settings", addr: 12, access: "rw" },
      },
    });
    const v = defineVariant(extra, { id: "y", metrics: { "settings.spare": null } });
    expect(v.metrics.find((m) => m.key === "settings.eco")).toBeDefined();
  });
});

describe("sumOf — keyPrefix diagnostics", () => {
  test("an empty keyPrefix aggregate names the prefix in its error", () => {
    expect(() =>
      defineProfile({
        id: "acme-empty-prefix",
        name: "x",
        manufacturer: "x",
        version: "1.0.0",
        metrics: [
          metric("total", {
            label: "Total",
            unit: "W",
            group: "g",
            computeExpr: sumOf({ keyPrefix: "bank" }),
          }),
        ],
      }),
    ).toThrow(/keyPrefix "bank"/);
  });
});
