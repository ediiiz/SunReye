import { describe, expect, test } from "bun:test";
import { bumpVersion, compareSemver, isNewerVersion } from "./semver";

describe("compareSemver", () => {
  test("orders by major, minor, then patch", () => {
    expect(compareSemver("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareSemver("1.2.0", "1.1.0")).toBeGreaterThan(0);
    expect(compareSemver("1.1.1", "1.1.2")).toBeLessThan(0);
    expect(compareSemver("1.1.1", "1.1.1")).toBe(0);
  });

  test("compares numeric segments numerically, not lexically", () => {
    expect(compareSemver("1.0.9", "1.0.10")).toBeLessThan(0);
    expect(compareSemver("0.9.0", "0.10.0")).toBeLessThan(0);
  });

  test("tolerates a leading v and ignores build metadata", () => {
    expect(compareSemver("v1.2.3", "1.2.3")).toBe(0);
    expect(compareSemver("1.2.3+build.5", "1.2.3+build.9")).toBe(0);
  });

  test("ranks a prerelease below its release and orders identifiers", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBeLessThan(0);
    expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
    expect(compareSemver("1.0.0-alpha.1", "1.0.0-alpha.2")).toBeLessThan(0);
    expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
    // Numeric prerelease identifiers rank below alphanumeric ones.
    expect(compareSemver("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
  });

  test("returns null when either side is not valid semver", () => {
    expect(compareSemver("1.0", "1.0.0")).toBeNull();
    expect(compareSemver("latest", "1.0.0")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  test("flags a genuine upgrade", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(true);
  });

  test("does not flag equal or older versions (no downgrade nagging)", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  test("falls back to string inequality for non-semver versions", () => {
    expect(isNewerVersion("2024-01", "2024-02")).toBe(true);
    expect(isNewerVersion("stable", "stable")).toBe(false);
  });
});

describe("bumpVersion", () => {
  test("increments the requested level and resets lower parts", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  test("drops prerelease/build tags and tolerates a leading v", () => {
    expect(bumpVersion("v1.2.3-beta.1", "patch")).toBe("1.2.4");
  });

  test("returns null for non-semver input", () => {
    expect(bumpVersion("latest", "patch")).toBeNull();
  });
});
