import { describe, expect, test } from "bun:test";
import { buildPowerGraph, flowColor, gridColor, sense, socColor } from "./power-graph";
import type { CanonicalRole, InverterCapabilities } from "$lib/inverter/types";

const caps = (over: Partial<InverterCapabilities>): InverterCapabilities =>
  ({
    pvStrings: 0,
    battery: false,
    backupLoad: false,
    generator: false,
    grid: false,
    ...over,
  }) as InverterCapabilities;

const powerFrom =
  (values: Partial<Record<string, number>>) => (role: CanonicalRole, index?: number) =>
    values[index === undefined ? role : `${role}#${index}`];

describe("buildPowerGraph", () => {
  test("no capabilities → single solar node from pv total", () => {
    const g = buildPowerGraph(caps({}), powerFrom({ "pv.total.power": 1200 }));
    expect(g.nodes.map((n) => n.id)).toEqual(["solar"]);
    expect(g.segments.map((s) => s.id)).toEqual(["solar-hub"]);
    expect(g.nodes[0].flow).toBe("in");
    expect(g.nodes[0].state).toBe("Producing");
  });

  test("one node and one segment per pv string", () => {
    const g = buildPowerGraph(
      caps({ pvStrings: 3 }),
      powerFrom({ "pv.string.power#1": 500, "pv.string.power#2": 0, "pv.string.power#3": 300 }),
    );
    expect(g.nodes.map((n) => n.id)).toEqual(["pv1", "pv2", "pv3"]);
    expect(g.nodes[1].flow).toBe("idle");
    // Multi-string routes take the elbowed 4-point rail into the hub.
    expect(g.segments.every((s) => s.pts.length === 4)).toBe(true);
  });

  test("battery sign convention: positive discharges, negative charges", () => {
    const discharging = buildPowerGraph(
      caps({ battery: true }),
      powerFrom({ "battery.power": 800 }),
    );
    expect(discharging.nodes.find((n) => n.id === "battery")?.state).toBe("Discharging");
    expect(discharging.nodes.find((n) => n.id === "battery")?.flow).toBe("in");
    const charging = buildPowerGraph(caps({ battery: true }), powerFrom({ "battery.power": -800 }));
    expect(charging.nodes.find((n) => n.id === "battery")?.state).toBe("Charging");
    expect(charging.nodes.find((n) => n.id === "battery")?.flow).toBe("out");
  });

  test("grid uses cost colors: import red, export green", () => {
    const importing = buildPowerGraph(caps({ grid: true }), powerFrom({ "grid.power": 400 }));
    expect(importing.nodes.find((n) => n.id === "grid")?.color).toBe("text-red-500");
    expect(importing.nodes.find((n) => n.id === "grid")?.state).toBe("Importing");
    const exporting = buildPowerGraph(caps({ grid: true }), powerFrom({ "grid.power": -400 }));
    expect(exporting.nodes.find((n) => n.id === "grid")?.color).toBe("text-emerald-500");
  });

  test("full capability set yields all nodes", () => {
    const g = buildPowerGraph(
      caps({ pvStrings: 2, battery: true, backupLoad: true, generator: true, grid: true }),
      () => undefined,
    );
    expect(g.nodes.map((n) => n.kind).sort()).toEqual([
      "battery",
      "generator",
      "grid",
      "load",
      "pv",
      "pv",
    ]);
    // Undefined power everywhere → everything idles (grid state included).
    expect(g.segments.every((s) => s.flow === "idle")).toBe(true);
  });
});

describe("helpers", () => {
  test("sense treats |v| <= 0.5 as idle", () => {
    const pos = { flow: "in", state: "On" } as const;
    const neg = { flow: "out", state: "Off" } as const;
    expect(sense(0.4, pos, neg).flow).toBe("idle");
    expect(sense(0.6, pos, neg)).toEqual(pos);
    expect(sense(-0.6, pos, neg)).toEqual(neg);
    expect(sense(undefined, pos, neg).flow).toBe("idle");
  });

  test("flowColor / gridColor map directions to hues", () => {
    expect(flowColor("in")).toBe("text-emerald-500");
    expect(flowColor("out")).toBe("text-amber-500");
    expect(flowColor("idle")).toBe("text-border");
    expect(gridColor(undefined)).toBe("text-border");
  });

  test("socColor interpolates across the 0/30/60 stops and clamps", () => {
    expect(socColor(0)).toBe("rgb(239, 68, 68)"); // red-500
    expect(socColor(30)).toBe("rgb(249, 115, 22)"); // orange-500
    expect(socColor(60)).toBe("rgb(34, 197, 94)"); // green-500
    expect(socColor(100)).toBe("rgb(34, 197, 94)"); // stays green
    expect(socColor(150)).toBe("rgb(34, 197, 94)"); // clamped
    expect(socColor(15)).toBe("rgb(244, 92, 45)"); // halfway red→orange
  });
});
