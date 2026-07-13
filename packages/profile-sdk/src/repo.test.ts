import { describe, expect, test } from "bun:test";

import {
  defineProfile,
  metric,
  parseProfileData,
  type ProfileData,
  repoIndexSchema,
} from "@SunReye/inverter-core";

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

describe("buildRepo change-aware versioning", () => {
  // A content change relative to `acme` (different metric label), same id/version.
  const acmeChanged = defineProfile({
    id: "acme-hybrid",
    name: "Acme Hybrid",
    manufacturer: "Acme",
    version: "1.0.0",
    metrics: [{ ...soc, label: "Battery State of Charge" }],
  });

  /** The last built profiles keyed by id, as `cmdBuild` would reload them. */
  function previousFrom(result: ReturnType<typeof buildRepo>): Map<string, ProfileData> {
    const previous = new Map<string, ProfileData>();
    for (const entry of result.index.profiles) {
      previous.set(entry.id, JSON.parse(result.files[entry.path]!) as ProfileData);
    }
    return previous;
  }

  test("first build marks every profile new at its source version", () => {
    const result = buildRepo([acme]);
    expect(result.versioning).toEqual([{ id: "acme-hybrid", version: "1.0.0", status: "new" }]);
  });

  test("keeps the version when content is unchanged", () => {
    const previous = previousFrom(buildRepo([acme]));
    const result = buildRepo([acme], { previous });
    expect(result.versioning[0]).toMatchObject({ version: "1.0.0", status: "unchanged" });
    expect(result.index.profiles[0]!.version).toBe("1.0.0");
  });

  test("auto-bumps (patch by default) when content changed without an author bump", () => {
    const previous = previousFrom(buildRepo([acme]));
    const result = buildRepo([acmeChanged], { previous });
    expect(result.versioning[0]).toEqual({
      id: "acme-hybrid",
      version: "1.0.1",
      previousVersion: "1.0.0",
      status: "auto-bumped",
    });
    // The emitted file carries the bumped version, not the source's 1.0.0.
    expect(parseProfileData(JSON.parse(result.files["profiles/acme-hybrid.json"]!)).version).toBe(
      "1.0.1",
    );
  });

  test("honors the requested bump level", () => {
    const previous = previousFrom(buildRepo([acme]));
    const result = buildRepo([acmeChanged], { previous, bump: "minor" });
    expect(result.versioning[0]).toMatchObject({ version: "1.1.0", status: "auto-bumped" });
  });

  test("a change to one profile never bumps an unchanged sibling", () => {
    const previous = previousFrom(buildRepo([acme, zeta]));
    const result = buildRepo([acmeChanged, zeta], { previous });
    const byId = new Map(result.versioning.map((v) => [v.id, v]));
    expect(byId.get("acme-hybrid")).toMatchObject({ version: "1.0.1", status: "auto-bumped" });
    expect(byId.get("zeta-one")).toMatchObject({ version: "0.2.0", status: "unchanged" });
  });

  test("honors an author-directed bump (source raised above published)", () => {
    const previous = previousFrom(buildRepo([acme]));
    const authorBumped = defineProfile({
      id: "acme-hybrid",
      name: "Acme Hybrid",
      manufacturer: "Acme",
      version: "2.0.0",
      metrics: [{ ...soc, label: "Battery State of Charge" }],
    });
    const result = buildRepo([authorBumped], { previous });
    expect(result.versioning[0]).toMatchObject({
      version: "2.0.0",
      previousVersion: "1.0.0",
      status: "author-bumped",
    });
  });

  test("treats the source version as a floor, keeping a higher published version", () => {
    // Simulate a prior auto-bump: published 1.5.0 while source still says 1.0.0.
    const previous = new Map<string, ProfileData>([["acme-hybrid", { ...acme, version: "1.5.0" }]]);
    const result = buildRepo([acme], { previous });
    expect(result.versioning[0]).toMatchObject({ version: "1.5.0", status: "unchanged" });
  });

  test("fails when content changed but the published version is not semver", () => {
    const previous = new Map<string, ProfileData>([
      ["acme-hybrid", { ...acme, version: "latest" }],
    ]);
    // Source keeps the same non-semver string, so this isn't an author bump —
    // and the SDK has no numeric version to auto-bump from.
    const result = buildRepo([{ ...acmeChanged, version: "latest" }], { previous });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain('published version "latest" is not semver');
  });
});
