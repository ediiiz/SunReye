import { describe, expect, test } from "bun:test";

import { aiGuideFiles, planUpgrade, scaffoldProject, titleFromId, toIdentifier } from "./init";

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
      "AGENTS.md",
      "CLAUDE.md",
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

  test("starter module is a valid, id-derived family export using the SDK", () => {
    const src = files["src/profiles.ts"]!;
    expect(src).toContain('from "@sunreye/profile-sdk"');
    expect(src).toContain("export const acmeHybrid = defineFamily({");
    expect(src).toContain('id: "acme-hybrid"');
    expect(src).toContain('manufacturer: "Acme"');
    // The starter demonstrates a keyed-overlay model (patch + wildcard remove).
    expect(src).toContain('"acme-hybrid-lite"');
    expect(src).toContain('"dc.pv2.power": null');
  });
});

describe("scaffoldProject — AI guide", () => {
  const files = scaffoldProject({
    packageName: "acme-profiles",
    repoName: "Acme Profiles",
    profile: { id: "acme-hybrid", name: "Acme Hybrid", manufacturer: "Acme" },
    sdkVersion: "1.2.0",
  });

  test("ships cross-tool AI guidance: AGENTS.md + a CLAUDE.md that imports it", () => {
    const agents = files["AGENTS.md"]!;
    // Portable standard read by any assistant; teaches the current SDK surface.
    expect(agents).toContain("# Authoring SunReye inverter profiles");
    expect(agents).toContain('sumOf({ role: "pv.string.power" })');
    expect(agents).toContain("bunx profile validate");
    // Claude Code reads CLAUDE.md, not AGENTS.md — so it just imports it.
    expect(files["CLAUDE.md"]).toBe("@AGENTS.md\n");
    // README points authors at the portable guide.
    expect(files["README.md"]).toContain("`AGENTS.md`");
  });
});

describe("planUpgrade", () => {
  const guide = Object.fromEntries(aiGuideFiles().map((f) => [f.path, f.contents]));
  const byPath = (plan: ReturnType<typeof planUpgrade>, path: string) =>
    plan.find((a) => a.path === path)!;

  test("writes both guide files fresh when absent", () => {
    const plan = planUpgrade({ "AGENTS.md": null, "CLAUDE.md": null }, false);
    expect(byPath(plan, "AGENTS.md")).toEqual({
      path: "AGENTS.md",
      status: "created",
      write: guide["AGENTS.md"]!,
    });
    expect(byPath(plan, "CLAUDE.md").status).toBe("created");
  });

  test("leaves current files untouched: AGENTS.md matches, CLAUDE.md already imports it", () => {
    const plan = planUpgrade(
      { "AGENTS.md": guide["AGENTS.md"]!, "CLAUDE.md": "@AGENTS.md\n\n# my notes\n" },
      false,
    );
    expect(byPath(plan, "AGENTS.md").status).toBe("unchanged");
    expect(byPath(plan, "CLAUDE.md")).toEqual({
      path: "CLAUDE.md",
      status: "unchanged",
      write: null,
    });
  });

  test("an edited AGENTS.md is kept unless --force", () => {
    const edited = { "AGENTS.md": "# my own guide\n", "CLAUDE.md": "@AGENTS.md\n" };
    const soft = byPath(planUpgrade(edited, false), "AGENTS.md");
    expect(soft.status).toBe("diverged");
    expect(soft.write).toBeNull();
    const forced = byPath(planUpgrade(edited, true), "AGENTS.md");
    expect(forced.status).toBe("updated");
    expect(forced.write).toBe(guide["AGENTS.md"]!);
  });

  test("a CLAUDE.md without the import is flagged for a manual edit, never clobbered", () => {
    const plan = planUpgrade(
      { "AGENTS.md": guide["AGENTS.md"]!, "CLAUDE.md": "# hand-written, no import\n" },
      true, // even with --force we don't overwrite the user's CLAUDE.md
    );
    expect(byPath(plan, "CLAUDE.md")).toEqual({
      path: "CLAUDE.md",
      status: "manual",
      write: null,
    });
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
