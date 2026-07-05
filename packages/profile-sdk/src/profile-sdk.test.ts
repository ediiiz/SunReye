import { describe, expect, test } from "bun:test";

import { defineProfile, metric, type ProfileData } from "@SunReye/inverter-core";
import { deyeSunsynkData } from "@SunReye/inverter-deye-sunsynk";

import { coverage } from "./coverage";
import { exerciseProfile } from "./harness";
import { scaffoldFromCsv } from "./scaffold";
import { validateProfile } from "./validate";

function tinyProfile(): ProfileData {
  return defineProfile({
    id: "tiny",
    name: "Tiny",
    manufacturer: "ACME",
    version: "1.0.0",
    metrics: [
      metric("battery/soc", {
        label: "SOC",
        unit: "%",
        group: "battery",
        addr: 1,
        role: "battery.soc",
      }),
    ],
  });
}

describe("validateProfile", () => {
  test("accepts the real Deye profile", () => {
    expect(validateProfile(deyeSunsynkData).ok).toBe(true);
  });

  test("reports readable issues for a broken profile", () => {
    const broken = {
      schemaVersion: 1,
      id: "x",
      name: "X",
      manufacturer: "X",
      version: "1",
      metrics: [],
    };
    const { ok, issues } = validateProfile(broken);
    expect(ok).toBe(false);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("coverage", () => {
  test("Deye maps most roles; tiny maps almost none", () => {
    const deye = coverage(deyeSunsynkData);
    expect(deye.mappedCount).toBeGreaterThan(30);
    expect(deye.total).toBe(deye.mapped.length + deye.missing.length);

    const tiny = coverage(tinyProfile());
    expect(tiny.mapped).toEqual(["battery.soc"]);
    expect(tiny.missing).toContain("grid.power");
  });
});

describe("exerciseProfile (test harness)", () => {
  test("runs the Deye profile through manifest + capabilities + a sim sample", async () => {
    const { manifest, capabilities, sample } = await exerciseProfile(deyeSunsynkData);
    expect(manifest.id).toBe("deye-sunsynk");
    expect(capabilities.pvStrings).toBe(2);
    // Every non-RAW, non-computed metric should produce a value.
    expect(Object.keys(sample).length).toBeGreaterThan(90);
    expect(sample["battery.soc"]).toBeDefined();
  });

  test("rejects an invalid profile", async () => {
    await expect(exerciseProfile({ schemaVersion: 1 } as unknown as ProfileData)).rejects.toThrow();
  });
});

describe("scaffoldFromCsv", () => {
  test("builds a valid register map from a CSV (roles left unmapped)", () => {
    const csv = [
      "topic,label,unit,group,addr,type,scale,access",
      "battery/soc,Battery SOC,%,battery,588,U_WORD,1,r",
      "total_energy,Total Production,kWh,inverter,534|535,U_DWORD,0.1,r",
      "settings/workmode,Work Mode,,settings,142,U_WORD,1,rw",
    ].join("\n");
    const data = scaffoldFromCsv(csv, {
      id: "scaffolded",
      name: "Scaffolded",
      manufacturer: "ACME",
      version: "0.1.0",
    });

    expect(data.metrics).toHaveLength(3);
    const soc = data.metrics.find((m) => m.key === "battery.soc");
    expect(soc?.addresses).toEqual([588]);
    expect(soc?.role).toBeUndefined(); // author maps roles afterwards
    const total = data.metrics.find((m) => m.key === "total_energy");
    expect(total?.type).toBe("U_DWORD");
    expect(total?.addresses).toEqual([534, 535]);
    expect(total?.scale).toBe(0.1);
    expect(data.metrics.find((m) => m.key === "settings.workmode")?.access).toBe("rw");

    // The scaffold output passes strict validation.
    expect(validateProfile(data).ok).toBe(true);
  });
});
