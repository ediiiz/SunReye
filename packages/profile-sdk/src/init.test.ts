import { describe, expect, test } from "bun:test";

import { scaffoldProject, titleFromId, toIdentifier } from "./init";

describe("scaffoldProject", () => {
  const files = scaffoldProject({
    packageName: "acme-profiles",
    repoName: "Acme Profiles",
    maintainer: "Acme Corp",
    profile: { id: "acme-hybrid", name: "Acme Hybrid", manufacturer: "Acme" },
    sdkVersion: "1.2.0",
  });

  test("emits the expected project layout", () => {
    expect(Object.keys(files).sort()).toEqual([
      ".gitignore",
      "README.md",
      "package.json",
      "src/profiles.ts",
      "tsconfig.json",
    ]);
  });

  test("package.json depends on the SDK and bakes the build command", () => {
    const pkg = JSON.parse(files["package.json"]!) as {
      name: string;
      private: boolean;
      scripts: { build: string };
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("acme-profiles");
    expect(pkg.private).toBe(true);
    expect(pkg.devDependencies["@sunreye/profile-sdk"]).toBe("^1.2.0");
    expect(pkg.scripts.build).toContain('--name "Acme Profiles"');
    expect(pkg.scripts.build).toContain('--maintainer "Acme Corp"');
  });

  test("omits the maintainer flag when none is given", () => {
    const noMaintainer = scaffoldProject({
      packageName: "p",
      repoName: "P",
      profile: { id: "x", name: "X", manufacturer: "X" },
      sdkVersion: "1.0.0",
    });
    const pkg = JSON.parse(noMaintainer["package.json"]!) as { scripts: { build: string } };
    expect(pkg.scripts.build).not.toContain("--maintainer");
  });

  test("starter module is a valid, id-derived export using the SDK", () => {
    const src = files["src/profiles.ts"]!;
    expect(src).toContain('from "@sunreye/profile-sdk"');
    expect(src).toContain("export const acmeHybrid = defineProfile({");
    expect(src).toContain('id: "acme-hybrid"');
    expect(src).toContain('manufacturer: "Acme"');
  });
});

describe("toIdentifier", () => {
  test("camel-cases and sanitizes ids", () => {
    expect(toIdentifier("acme-hybrid")).toBe("acmeHybrid");
    expect(toIdentifier("deye.sg05lp3")).toBe("deyeSg05lp3");
    expect(toIdentifier("123-abc")).toBe("Abc");
    expect(toIdentifier("999")).toBe("p");
    expect(toIdentifier("")).toBe("profile");
  });
});

describe("titleFromId", () => {
  test("title-cases id words", () => {
    expect(titleFromId("acme-hybrid")).toBe("Acme Hybrid");
    expect(titleFromId("sunreye")).toBe("Sunreye");
  });
});
