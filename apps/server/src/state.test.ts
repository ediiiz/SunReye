import type { InverterSample } from "@SunReye/inverter-core";
import { describe, expect, test } from "bun:test";
import { liveState } from "./state";

const sample = (id: string, soc: number): InverterSample => ({
  time: new Date().toISOString(),
  inverterId: id,
  metrics: { "battery.soc": soc },
});

describe("liveState", () => {
  test("returns the last sample handed to set()", () => {
    const first = sample("inv-a", 42);
    liveState.set(first);
    expect(liveState.latest).toBe(first);
  });

  test("a newer sample replaces the previous one", () => {
    liveState.set(sample("inv-a", 42));
    const next = sample("inv-a", 43);
    liveState.set(next);
    expect(liveState.latest).toBe(next);
    expect(liveState.latest?.metrics["battery.soc"]).toBe(43);
  });
});
