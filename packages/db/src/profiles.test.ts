import { describe, expect, test } from "bun:test";
import { LEGACY_DEFAULT_SOURCE_URL, profileSourceSchema, profileSourcesSchema } from "./profiles";

describe("profileSourcesSchema", () => {
  test("defaults to no sources (core ships clean — external repos added manually)", () => {
    expect(profileSourcesSchema.parse({})).toEqual({ sources: [] });
  });

  test("accepts a manually-added https .git source, defaulting enabled", () => {
    const parsed = profileSourcesSchema.parse({
      sources: [{ url: "https://github.com/org/inverter-profiles.git" }],
    });
    expect(parsed.sources).toEqual([
      { url: "https://github.com/org/inverter-profiles.git", enabled: true },
    ]);
  });

  test("rejects non-https and non-.git URLs", () => {
    expect(profileSourceSchema.safeParse({ url: "http://x/repo.git" }).success).toBe(false);
    expect(profileSourceSchema.safeParse({ url: "https://github.com/org/repo" }).success).toBe(
      false,
    );
  });
});

describe("LEGACY_DEFAULT_SOURCE_URL", () => {
  test("is the stale hardcoded repo the seed migration drops", () => {
    expect(LEGACY_DEFAULT_SOURCE_URL).toBe("https://github.com/sunreye/inverter-profiles.git");
  });
});
