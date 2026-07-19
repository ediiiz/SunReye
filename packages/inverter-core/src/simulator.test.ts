import { describe, expect, test } from "bun:test";

import { SimulatedInverter } from "./simulator";
import type { InverterProfile, MetricDef, SimContext } from "./types";

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

/** Profile with a coherent hook plus one metric of every fallback shape. */
function hookedProfile(calls: SimContext[]): InverterProfile {
  return {
    id: "sim-test-hooked",
    name: "Sim Test",
    manufacturer: "Test",
    metrics: [
      def({ key: "battery.soc", unit: "%" }), // set by the hook
      def({ key: "settings.limit", unit: "%", access: "rw" }), // fallback 50
      def({ key: "gen.voltage", unit: "V", group: "generator" }), // idle generator → 0
      def({ key: "grid.voltage", unit: "V", group: "grid" }), // nominal mains → 230
      def({ key: "inverter.temp", unit: "°C" }), // ambient → 25
      def({ key: "dc.pv1.power", unit: "W" }), // default → 0
      def({ key: "sys.time", type: "RAW", addresses: [22, 23, 24] }), // never sampled
      def({
        key: "battery.soc_doubled",
        addresses: [],
        compute: (v) => (v["battery.soc"] ?? 0) * 2,
      }),
    ],
    simulate: (ctx) => {
      calls.push({ ...ctx });
      return { "battery.soc": 77 };
    },
  };
}

describe("SimulatedInverter — read", () => {
  test("uses the profile hook, fills the rest with the noise-free fallback", async () => {
    const calls: SimContext[] = [];
    const inv = new SimulatedInverter(hookedProfile(calls));
    const sample = await inv.read();

    expect(sample.inverterId).toBe("sim-test-hooked");
    expect(Date.parse(sample.time)).not.toBeNaN();
    expect(sample.metrics["battery.soc"]).toBe(77); // from the hook
    expect(sample.metrics["settings.limit"]).toBe(50); // % fallback
    expect(sample.metrics["gen.voltage"]).toBe(0); // generator V fallback
    expect(sample.metrics["grid.voltage"]).toBe(230); // V fallback
    expect(sample.metrics["inverter.temp"]).toBe(25); // °C fallback
    expect(sample.metrics["dc.pv1.power"]).toBe(0); // default fallback
    expect(sample.metrics["sys.time"]).toBeUndefined(); // RAW excluded
    expect(sample.metrics["battery.soc_doubled"]).toBe(154); // computed afterwards
  });

  test("passes dtSec 0 on the first sample, elapsed seconds afterwards", async () => {
    const calls: SimContext[] = [];
    const inv = new SimulatedInverter(hookedProfile(calls));
    await inv.read();
    await new Promise((r) => setTimeout(r, 10));
    await inv.read();
    expect(calls[0]?.dtSec).toBe(0);
    expect(calls[1]?.dtSec).toBeGreaterThan(0);
  });

  test("falls back to the generic role-based model when no hook exists", async () => {
    const inv = new SimulatedInverter({
      id: "sim-test-generic",
      name: "Generic",
      manufacturer: "Test",
      metrics: [
        def({ key: "battery.soc", unit: "%", role: "battery.soc" }),
        def({ key: "battery.power", unit: "W", type: "S_WORD", role: "battery.power" }),
      ],
    });
    const { metrics } = await inv.read();
    // genericSimulate keeps SoC inside its plant bounds (MIN_SOC..100).
    expect(metrics["battery.soc"]).toBeGreaterThanOrEqual(15);
    expect(metrics["battery.soc"]).toBeLessThanOrEqual(100);
    expect(typeof metrics["battery.power"]).toBe("number");
  });
});

describe("SimulatedInverter — write", () => {
  test("rejects an unknown metric", async () => {
    const inv = new SimulatedInverter(hookedProfile([]));
    await expect(inv.write("no.such.key", 1)).rejects.toThrow(/unknown metric/);
  });

  test("rejects a read-only metric", async () => {
    const inv = new SimulatedInverter(hookedProfile([]));
    await expect(inv.write("grid.voltage", 240)).rejects.toThrow(/read-only/);
  });

  test("a written setting round-trips over the modeled/fallback value", async () => {
    const inv = new SimulatedInverter(hookedProfile([]));
    expect((await inv.read()).metrics["settings.limit"]).toBe(50);
    await inv.write("settings.limit", 80);
    expect((await inv.read()).metrics["settings.limit"]).toBe(80);
  });
});

describe("SimulatedInverter — close", () => {
  test("resolves without side effects", async () => {
    const inv = new SimulatedInverter(hookedProfile([]));
    await expect(inv.close()).resolves.toBeUndefined();
  });
});
