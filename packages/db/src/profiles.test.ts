import { describe, expect, test } from "bun:test";
import {
  isOfficialSource,
  LEGACY_DEFAULT_SOURCE_URL,
  mergeOfficialSource,
  OFFICIAL_SOURCE_URL,
  profileSourceSchema,
  profileSourcesSchema,
} from "./profiles";

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

  test("rejects non-https URLs but accepts https with or without a trailing .git", () => {
    expect(profileSourceSchema.safeParse({ url: "http://x/repo.git" }).success).toBe(false);
    // `.git` is optional — GitHub clones fine without it, and the official source
    // is stored without it.
    expect(profileSourceSchema.safeParse({ url: "https://github.com/org/repo" }).success).toBe(
      true,
    );
    expect(profileSourceSchema.safeParse({ url: "https://github.com/org/repo.git" }).success).toBe(
      true,
    );
  });
});

describe("LEGACY_DEFAULT_SOURCE_URL", () => {
  test("is the stale hardcoded repo the seed migration drops", () => {
    expect(LEGACY_DEFAULT_SOURCE_URL).toBe("https://github.com/sunreye/inverter-profiles.git");
  });
});

describe("official source (protected, merge-on-read)", () => {
  test("recognizes the official URL regardless of case / .git / trailing slash", () => {
    expect(isOfficialSource(OFFICIAL_SOURCE_URL)).toBe(true);
    expect(isOfficialSource("https://github.com/sunreye/sunreye-official-profiles")).toBe(true);
    expect(isOfficialSource("https://github.com/org/other.git")).toBe(false);
  });

  test("injects the official source when absent, at the top", () => {
    const merged = mergeOfficialSource([{ url: "https://github.com/org/x.git", enabled: true }]);
    expect(merged).toHaveLength(2);
    expect(isOfficialSource(merged[0]!.url)).toBe(true);
    expect(merged[0]!.enabled).toBe(true);
  });

  test("preserves an existing (even disabled) official entry without duplicating", () => {
    const merged = mergeOfficialSource([{ url: OFFICIAL_SOURCE_URL, enabled: false }]);
    expect(merged).toEqual([{ url: OFFICIAL_SOURCE_URL, enabled: false }]);
  });
});
