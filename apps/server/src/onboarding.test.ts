import { inverterConfigSchema } from "@SunReye/db/inverter-config";
import { describe, expect, test } from "bun:test";
import { resolveProfileById } from "./inverter";
import { testInverter } from "./runtime";

// Onboarding runs before any profile is active, so the test-read path must
// resolve a *chosen* profile independently of the (unstarted) runtime. The
// built-in path is DB-free — it resolves straight from the registry — so it's
// exercisable here without a live database.

describe("resolveProfileById", () => {
  test("resolves a registered built-in without touching the DB", async () => {
    const profile = await resolveProfileById("deye-sg05lp3");
    expect(profile?.id).toBe("deye-sg05lp3");
  });
});

describe("testInverter", () => {
  test("reports no profile selected when none is chosen or active", async () => {
    // No profileId and no active profile (initProfiles never ran) → short-circuit
    // before any source is built, so no DB/socket is touched.
    const result = await testInverter(null, inverterConfigSchema.parse({}));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No profile selected");
  });
});
