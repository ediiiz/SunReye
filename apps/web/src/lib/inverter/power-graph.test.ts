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
    // Multi-string landscape routes take the cubic S-curve (4 pts) into the hub,
    // except a string that already sits on the hub's row, which runs straight.
    expect(
      g.segments.every((s) => s.pts.length === 4 || (s.pts.length === 2 && s.pts[0].y === g.hub.y)),
    ).toBe(true);
  });

  test("orientation moves the grid: right of the hub in landscape, sink row in portrait", () => {
    const power = powerFrom({ "grid.power": 400 });
    const landscape = buildPowerGraph(caps({ grid: true }), power, "landscape");
    const lGrid = landscape.nodes.find((n) => n.id === "grid");
    expect(lGrid?.at.x).toBeGreaterThan(landscape.hub.x);
    expect(lGrid?.at.y).toBe(landscape.hub.y);
    const portrait = buildPowerGraph(caps({ grid: true }), power, "portrait");
    const pGrid = portrait.nodes.find((n) => n.id === "grid");
    expect(pGrid?.at.y).toBeGreaterThan(portrait.hub.y);
  });

  test("portrait pv captions sit above their nodes, clear of the connectors", () => {
    const power = powerFrom({ "pv.string.power#1": 500, "pv.string.power#2": 300 });
    const portrait = buildPowerGraph(caps({ pvStrings: 2 }), power, "portrait");
    expect(portrait.nodes.every((n) => n.labelSide === "above")).toBe(true);
    const landscape = buildPowerGraph(caps({ pvStrings: 2 }), power, "landscape");
    expect(landscape.nodes.every((n) => n.labelSide === "below")).toBe(true);
  });

  test("every segment ends at the hub in both orientations", () => {
    const power = powerFrom({});
    for (const orientation of ["landscape", "portrait"] as const) {
      const g = buildPowerGraph(
        caps({ pvStrings: 2, battery: true, backupLoad: true, generator: true, grid: true }),
        power,
        orientation,
      );
      expect(g.segments.every((s) => s.pts.at(-1)?.x === g.hub.x)).toBe(true);
      expect(g.segments.every((s) => s.pts.at(-1)?.y === g.hub.y)).toBe(true);
    }
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

  // `has` reports whether a metric is *visible* (Settings → Sensors). Capabilities
  // stay true, so a hidden subsystem must drop its node/segment via `has` alone.
  const hidden = (keys: string[]) => (role: CanonicalRole, index?: number) =>
    !keys.includes(index === undefined ? role : `${role}#${index}`);

  test("hidden group drops its node even though the capability stays true", () => {
    const g = buildPowerGraph(
      caps({ battery: true, backupLoad: true, generator: true, grid: true }),
      () => undefined,
      "landscape",
      hidden(["generator.power"]),
    );
    const kinds = g.nodes.map((n) => n.kind);
    expect(kinds).not.toContain("generator");
    expect(kinds).toContain("battery");
    expect(g.segments.some((s) => s.id === "generator-hub")).toBe(false);
  });

  test("hiding one PV string keeps the others", () => {
    const g = buildPowerGraph(
      caps({ pvStrings: 3 }),
      powerFrom({ "pv.string.power#1": 500, "pv.string.power#3": 300 }),
      "landscape",
      hidden(["pv.string.power#2"]),
    );
    expect(g.nodes.map((n) => n.id)).toEqual(["pv1", "pv3"]);
    expect(g.segments.map((s) => s.id)).toEqual(["pv1-hub", "pv3-hub"]);
  });

  test("all strings hidden falls back to the aggregate solar node when visible", () => {
    const g = buildPowerGraph(
      caps({ pvStrings: 2 }),
      powerFrom({ "pv.total.power": 900 }),
      "landscape",
      hidden(["pv.string.power#1", "pv.string.power#2"]),
    );
    expect(g.nodes.map((n) => n.id)).toEqual(["solar"]);
  });

  test("charger branches off the load node, not the hub", () => {
    const g = buildPowerGraph(
      caps({ backupLoad: true, grid: true }),
      powerFrom({ "load.power": 2400 }),
      "landscape",
      () => true,
      { power: 1800, soc: 75, connected: true, charging: true },
    );
    const charger = g.nodes.find((n) => n.kind === "charger");
    const load = g.nodes.find((n) => n.kind === "load");
    expect(charger?.value).toBe(1800);
    expect(charger?.flow).toBe("out");
    const seg = g.segments.find((s) => s.id === "load-charger");
    expect(seg?.pts.at(-1)).toEqual(load?.at);
    // Every other segment still ends at the hub.
    expect(
      g.segments
        .filter((s) => s.id !== "load-charger")
        .every((s) => s.pts.at(-1)?.x === g.hub.x && s.pts.at(-1)?.y === g.hub.y),
    ).toBe(true);
  });

  test("charger needs a visible load node to branch from", () => {
    const noLoad = buildPowerGraph(
      caps({ grid: true }),
      () => undefined,
      "landscape",
      () => true,
      {
        power: 1800,
        connected: true,
        charging: true,
      },
    );
    expect(noLoad.nodes.some((n) => n.kind === "charger")).toBe(false);
    const hiddenLoad = buildPowerGraph(
      caps({ backupLoad: true }),
      () => undefined,
      "landscape",
      hidden(["load.power"]),
      { power: 1800, connected: true, charging: true },
    );
    expect(hiddenLoad.nodes.some((n) => n.kind === "charger")).toBe(false);
  });

  test("plugged-in but not charging charger idles", () => {
    const g = buildPowerGraph(
      caps({ backupLoad: true }),
      powerFrom({ "load.power": 900 }),
      "portrait",
      () => true,
      { power: 0, connected: true, charging: false },
    );
    const charger = g.nodes.find((n) => n.kind === "charger");
    expect(charger?.flow).toBe("idle");
  });

  test("no visible PV metric at all yields no PV node", () => {
    const g = buildPowerGraph(
      caps({ pvStrings: 1 }),
      () => undefined,
      "landscape",
      hidden(["pv.string.power#1", "pv.total.power"]),
    );
    expect(g.nodes.some((n) => n.kind === "pv")).toBe(false);
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
