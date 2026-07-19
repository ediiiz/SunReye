import { describe, expect, test } from "bun:test";

import { decode, encodeWord, registerWidth } from "./codec";
import type { MetricDef } from "./types";

/** Minimal register-backed metric with codec-relevant fields. */
const def = (over: Partial<MetricDef>): MetricDef => ({
  key: "test.metric",
  topic: "test/metric",
  label: "Test",
  unit: null,
  group: "test",
  type: "U_WORD",
  addresses: [100],
  scale: 1,
  access: "r",
  ...over,
});

const regs = (entries: [number, number][]) => new Map<number, number>(entries);

describe("registerWidth", () => {
  test("single-word types occupy one register", () => {
    expect(registerWidth("U_WORD", [100])).toBe(1);
    expect(registerWidth("S_WORD", [100])).toBe(1);
  });

  test("U_DWORD occupies two registers", () => {
    expect(registerWidth("U_DWORD", [100, 101])).toBe(2);
  });

  test("RAW occupies as many registers as it lists", () => {
    expect(registerWidth("RAW", [22, 23, 24])).toBe(3);
  });
});

describe("decode", () => {
  test("U_WORD scales the raw word", () => {
    const m = def({ type: "U_WORD", addresses: [672], scale: 0.1 });
    expect(decode(m, regs([[672, 2305]]))).toBeCloseTo(230.5);
  });

  test("U_WORD applies the post-scale offset (vendor +1000 temp encoding)", () => {
    // register = °C×10 + 1000 → scale 0.1, offset -100.
    const m = def({ type: "U_WORD", addresses: [540], scale: 0.1, offset: -100 });
    expect(decode(m, regs([[540, 1425]]))).toBeCloseTo(42.5);
  });

  test("U_WORD reads a missing register as 0", () => {
    const m = def({ type: "U_WORD", addresses: [672], scale: 10, offset: 5 });
    expect(decode(m, regs([]))).toBe(5);
  });

  test("S_WORD decodes two's-complement negatives (battery discharging)", () => {
    const m = def({ type: "S_WORD", addresses: [590], scale: 1 });
    expect(decode(m, regs([[590, 0xffff]]))).toBe(-1);
    expect(decode(m, regs([[590, 0x10000 - 3500]]))).toBe(-3500);
  });

  test("S_WORD keeps values ≤ 0x7fff positive", () => {
    const m = def({ type: "S_WORD", addresses: [590], scale: 0.01 });
    expect(decode(m, regs([[590, 0x7fff]]))).toBeCloseTo(327.67);
  });

  test("U_DWORD combines low word first, high word second", () => {
    const m = def({ type: "U_DWORD", addresses: [534, 535], scale: 0.1 });
    // raw = 5000 + 2*65536 = 136072 → 13607.2 kWh
    expect(
      decode(
        m,
        regs([
          [534, 5000],
          [535, 2],
        ]),
      ),
    ).toBeCloseTo(13607.2);
  });

  test("U_DWORD stays exact above the signed-int32 range", () => {
    const m = def({ type: "U_DWORD", addresses: [10, 11], scale: 1 });
    expect(
      decode(
        m,
        regs([
          [10, 0xffff],
          [11, 0xffff],
        ]),
      ),
    ).toBe(0xffffffff);
  });

  test("U_DWORD without both addresses decodes to undefined", () => {
    const m = def({ type: "U_DWORD", addresses: [534], scale: 1 });
    expect(decode(m, regs([[534, 5]]))).toBeUndefined();
  });

  test("addressless single-word metrics decode to undefined", () => {
    expect(decode(def({ type: "U_WORD", addresses: [] }), regs([]))).toBeUndefined();
    expect(decode(def({ type: "S_WORD", addresses: [] }), regs([]))).toBeUndefined();
  });

  test("RAW never yields a numeric value", () => {
    const m = def({ type: "RAW", addresses: [22, 23, 24] });
    expect(decode(m, regs([[22, 1]]))).toBeUndefined();
  });
});

describe("encodeWord", () => {
  test("divides out the scale and rounds to the nearest raw word", () => {
    const m = def({ type: "U_WORD", scale: 0.1, access: "rw" });
    expect(encodeWord(m, 23.04)).toBe(230);
    expect(encodeWord(m, 23.06)).toBe(231);
  });

  test("subtracts the offset before scaling", () => {
    const m = def({ type: "U_WORD", scale: 0.1, offset: -100, access: "rw" });
    expect(encodeWord(m, 42.5)).toBe(1425);
  });

  test("S_WORD encodes negatives as two's complement", () => {
    const m = def({ type: "S_WORD", scale: 1, access: "rw" });
    expect(encodeWord(m, -1)).toBe(0xffff);
    expect(encodeWord(m, -3500)).toBe(0x10000 - 3500);
    expect(encodeWord(m, 42)).toBe(42);
  });

  test("U_WORD masks to 16 bits", () => {
    const m = def({ type: "U_WORD", scale: 1, access: "rw" });
    expect(encodeWord(m, 0x1ffff)).toBe(0xffff);
  });

  test("round-trips through decode", () => {
    const m = def({ type: "S_WORD", addresses: [109], scale: 0.5, offset: -10, access: "rw" });
    const word = encodeWord(m, 25);
    expect(decode(m, regs([[109, word]]))).toBe(25);
  });
});
