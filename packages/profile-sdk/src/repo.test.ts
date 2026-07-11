import { describe, expect, test } from "bun:test";

import { defineProfile, metric, parseProfileData, repoIndexSchema } from "@SunReye/inverter-core";

import { buildRepo } from "./repo";

const soc = metric("battery/soc", {
  label: "Battery SoC",
  group: "battery",
  role: "battery.soc",
  addr: 588,
  unit: "%",
});

const acme = defineProfile({
  id: "acme-hybrid",
  name: "Acme Hybrid",
  manufacturer: "Acme",
  version: "1.0.0",
  metrics: [soc],
});

const zeta = defineProfile({
  id: "zeta-one",
  name: "Zeta One",
  manufacturer: "Zeta",
  version: "0.2.0",
  metrics: [soc],
});

describe("buildRepo", () => {
  test("lays out index.json + one file per profile, sorted by id", () => {
    const result = buildRepo([zeta, { profile: acme, description: "Acme 5–12 kW range" }], {
      name: "Test Repo",
      maintainer: "Ediz",
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(Object.keys(result.files).sort()).toEqual([
      "index.json",
      "profiles/acme-hybrid.json",
      "profiles/zeta-one.json",
    ]);

    // The emitted index must round-trip through the exact schema the server uses.
    const index = repoIndexSchema.parse(JSON.parse(result.files["index.json"]!));
    expect(index.name).toBe("Test Repo");
    expect(index.maintainer).toBe("Ediz");
    expect(index.profiles.map((p) => p.id)).toEqual(["acme-hybrid", "zeta-one"]);
    expect(index.profiles[0]).toEqual({
      id: "acme-hybrid",
      name: "Acme Hybrid",
      manufacturer: "Acme",
      version: "1.0.0",
      path: "profiles/acme-hybrid.json",
      description: "Acme 5–12 kW range",
    });
    expect(index.profiles[1]!.description).toBeUndefined();

    // Every profile file must round-trip through the strict profile schema.
    for (const entry of index.profiles) {
      const data = parseProfileData(JSON.parse(result.files[entry.path]!));
      expect(data.id).toBe(entry.id);
    }
  });

  test("omits optional index metadata when not given", () => {
    const result = buildRepo([acme]);
    const index = JSON.parse(result.files["index.json"]!);
    expect("name" in index).toBe(false);
    expect("maintainer" in index).toBe(false);
  });

  test("fails the whole build when a profile is invalid", () => {
    const broken = { ...acme, metrics: [] } as typeof acme;
    const result = buildRepo([acme, broken]);
    expect(result.ok).toBe(false);
    expect(result.files).toEqual({});
    expect(result.issues.some((i) => i.startsWith("profiles[1] (acme-hybrid):"))).toBe(true);
  });

  test("fails on duplicate profile ids", () => {
    const result = buildRepo([acme, { ...acme }]);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      "profiles[1] (acme-hybrid): duplicate profile id (already used by profiles[0])",
    ]);
  });
});
