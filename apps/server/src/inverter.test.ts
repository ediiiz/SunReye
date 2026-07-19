import { inverterConfigSchema } from "@SunReye/db/inverter-config";
import { ACTIVE_PROFILE_KEY } from "@SunReye/db/profiles";
import { hydrateProfile, registerProfile, type ProfileData } from "@SunReye/inverter-core";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// initProfiles reads the active-profile id from app_settings and the installed
// profiles from the DB. Mock both so we can drive the boot path without a DB.
// The mock is key-aware so dropLegacyDefaultSource (real ./profiles) reads its
// sources fallback instead of the active-profile stub, and writeSetting/
// cachedSetting ride along so any other module resolving "./app-settings" via
// the process-global mock registry keeps working.
let activeId = "";
mock.module("./app-settings", () => ({
  readSetting: async <T>(key: string, _schema: unknown, fallback: T) =>
    key === ACTIVE_PROFILE_KEY ? { id: activeId } : fallback,
  writeSetting: async () => {},
  cachedSetting: <T>(_key: string, _schema: unknown, fallback: T) => ({
    get: async () => fallback,
    set: async (input: T) => input,
  }),
}));
// loadInstalledProfiles does `await db.select().from(installedProfiles)`;
// resolveProfileById chains `.where(...)` onto the same builder.
let installedRows: Array<{ id: string; data: unknown }> = [];
let profileRows: Array<{ id: string; data: unknown }> = [];
mock.module("@SunReye/db", () => ({
  db: {
    select: () => ({
      from: () =>
        Object.assign(Promise.resolve(installedRows), {
          where: async () => profileRows,
        }),
    }),
  },
}));

const {
  buildProfileContext,
  buildSource,
  getActiveProfileOrNull,
  initProfiles,
  resolveProfileById,
} = await import("./inverter");

const profileData = (id: string): ProfileData => ({
  schemaVersion: 1,
  id,
  name: "Installed",
  manufacturer: "Test",
  version: "1.0.0",
  metrics: [
    {
      key: "battery.soc",
      topic: "battery/soc",
      label: "SOC",
      unit: "%",
      group: "battery",
      type: "U_WORD",
      addresses: [1],
      scale: 1,
      access: "r",
      role: "battery.soc",
    },
  ],
});

const profile: ProfileData = profileData("installed-one");

describe("initProfiles", () => {
  beforeEach(() => {
    activeId = "";
    installedRows = [];
  });

  afterAll(async () => {
    // Reset the module-level active profile so later files (onboarding.test)
    // still see the "nothing configured" boot state.
    activeId = "";
    installedRows = [];
    await initProfiles();
  });

  test("boots onboarding-only (null) when nothing is configured", async () => {
    await expect(initProfiles()).resolves.toBeNull();
    expect(getActiveProfileOrNull()).toBeNull();
  });

  test("boots onboarding-only (null) when the saved id is no longer installed", async () => {
    // Regression: an upgrade that dropped a formerly built-in package leaves a
    // stale active-profile id in app_settings. Boot must degrade, not crash.
    activeId = "gone-with-the-upgrade";
    await expect(initProfiles()).resolves.toBeNull();
  });

  test("resolves the active profile when it is registered", async () => {
    registerProfile(hydrateProfile(profile));
    activeId = "installed-one";
    const result = await initProfiles();
    expect(result?.id).toBe("installed-one");
    expect(getActiveProfileOrNull()?.id).toBe("installed-one");
  });

  test("registers DB-installed rows and skips invalid ones", async () => {
    installedRows = [
      { id: "installed-from-db", data: profileData("installed-from-db") },
      // A row written before a schema change: skipped with a log, never fatal.
      { id: "broken", data: { nope: true } },
    ];
    activeId = "installed-from-db";
    const result = await initProfiles();
    expect(result?.id).toBe("installed-from-db");
  });
});

describe("resolveProfileById", () => {
  test("resolves a registered profile without touching the DB", async () => {
    registerProfile(hydrateProfile(profileData("registered-only")));
    profileRows = [];
    const resolved = await resolveProfileById("registered-only");
    expect(resolved?.id).toBe("registered-only");
  });

  test("hydrates a freshly-installed DB row when not registered", async () => {
    profileRows = [{ id: "db-only", data: profileData("db-only") }];
    const resolved = await resolveProfileById("db-only");
    expect(resolved?.id).toBe("db-only");
    expect(resolved?.metrics).toHaveLength(1);
  });

  test("returns null for an unknown id", async () => {
    profileRows = [];
    await expect(resolveProfileById("no-such-profile")).resolves.toBeNull();
  });
});

describe("buildSource", () => {
  test("builds a live source from profile + connection config", () => {
    const p = hydrateProfile(profileData("source-profile"));
    // Default config: no host yet (empty string is passed through; a real
    // connect would fail later, which the God-loop handles).
    const source = buildSource(p, inverterConfigSchema.parse({}));
    expect(source.profile.id).toBe("source-profile");
    expect(typeof source.read).toBe("function");
    expect(typeof source.close).toBe("function");
  });
});

describe("buildProfileContext", () => {
  const ctxProfile = hydrateProfile({
    schemaVersion: 1,
    id: "ctx-profile",
    name: "Ctx",
    manufacturer: "Test",
    version: "1.0.0",
    metrics: [
      {
        key: "soc.max",
        topic: "soc/max",
        label: "SOC max",
        unit: "%",
        group: "battery",
        type: "U_WORD",
        addresses: [10],
        scale: 1,
        access: "rw",
        range: { min: 0, max: 100 },
      },
      {
        key: "mode",
        topic: "mode",
        label: "Mode",
        unit: null,
        group: "control",
        type: "U_WORD",
        addresses: [11],
        scale: 1,
        access: "rw",
        enumLabels: { "0": "Off", "1": "On" },
      },
      {
        key: "power",
        topic: "power",
        label: "Power",
        unit: "W",
        group: "pv",
        type: "S_WORD",
        addresses: [12],
        scale: 1,
        access: "r",
      },
    ],
  });
  const ctx = buildProfileContext(ctxProfile);

  test("derives manifest + lookup maps from the profile", () => {
    expect(ctx.profile.id).toBe("ctx-profile");
    expect(ctx.defByKey.get("soc.max")?.access).toBe("rw");
    expect(ctx.metaByKey.get("mode")?.enumLabels).toEqual({ "0": "Off", "1": "On" });
    expect(ctx.manifest.metrics).toHaveLength(3);
  });

  test("validateWrite accepts in-range and enum-member values", () => {
    expect(ctx.validateWrite("soc.max", 80)).toBeNull();
    expect(ctx.validateWrite("mode", 1)).toBeNull();
  });

  test("validateWrite rejects unknown, read-only, and constraint-violating writes", () => {
    expect(ctx.validateWrite("nope", 1)).toBe("Unknown entity: nope");
    expect(ctx.validateWrite("power", 1)).toBe("Entity is not writable: power");
    expect(ctx.validateWrite("mode", 5)).toBe("Value must be one of: 0, 1");
    expect(ctx.validateWrite("soc.max", -1)).toBe("Value -1 is below minimum 0");
    expect(ctx.validateWrite("soc.max", 101)).toBe("Value 101 is above maximum 100");
  });
});
