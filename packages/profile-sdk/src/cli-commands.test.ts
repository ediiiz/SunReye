import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProfileData } from "@SunReye/inverter-core";

// A real, full profile fixture (the published Deye SG05LP3), snapshotted so the
// CLI tests build/validate a realistic profile without depending on any inverter
// package. Source of truth: github.com/SunReye/SunReye-Official-Profiles.
import sampleProfile from "./__fixtures__/sample-profile.json";
import {
  cmdBuild,
  cmdCoverage,
  cmdInit,
  cmdScaffold,
  cmdUpgrade,
  cmdValidate,
  flags,
} from "./cli-commands";

const deyeSg05lp3Data = sampleProfile as unknown as ProfileData;

const dir = mkdtempSync(join(tmpdir(), "profile-cli-"));

function writeFixture(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const validProfilePath = writeFixture("deye.json", JSON.stringify(deyeSg05lp3Data));
const brokenProfilePath = writeFixture(
  "broken.json",
  JSON.stringify({
    schemaVersion: 1,
    id: "x",
    name: "X",
    manufacturer: "X",
    version: "1",
    metrics: [],
  }),
);
const csvPath = writeFixture(
  "regs.csv",
  [
    "topic,label,unit,group,addr,type,scale,access",
    "battery/soc,Battery SOC,%,battery,588,U_WORD,1,r",
    "total_energy,Total Production,kWh,inverter,534|535,U_DWORD,0.1,r",
  ].join("\n"),
);

/** Capture stdout/stderr lines and turn `process.exit` into a throw. */
function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  const spies = [
    spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.join(" "));
    }),
    spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      err.push(a.join(" "));
    }),
    spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never),
  ];
  return { out, err, restore: () => spies.forEach((s) => s.mockRestore()) };
}

let io: ReturnType<typeof captureIo> | undefined;
afterEach(() => io?.restore());

describe("flags", () => {
  test("parses --flag value pairs and tolerates a trailing flag", () => {
    expect(flags(["--id", "x", "--name", "N", "--version"])).toEqual({
      id: "x",
      name: "N",
      version: "",
    });
    expect(flags([])).toEqual({});
  });
});

describe("cmdValidate", () => {
  test("accepts a valid profile", async () => {
    io = captureIo();
    await cmdValidate(validProfilePath);
    expect(io.out.join("\n")).toContain("valid profile");
  });

  test("exits 1 with issues for a broken profile", async () => {
    io = captureIo();
    await expect(cmdValidate(brokenProfilePath)).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("is invalid");
  });

  test("exits with usage when no path given", async () => {
    io = captureIo();
    await expect(cmdValidate(undefined)).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("usage:");
  });
});

describe("cmdCoverage", () => {
  test("prints the role-coverage report for a valid profile", async () => {
    io = captureIo();
    await cmdCoverage(validProfilePath);
    expect(io.out.join("\n")).toContain("Role coverage:");
  });

  test("suggests sumOf for a sum that covers an indexed role group", async () => {
    io = captureIo();
    // The Deye base's dc.total_power sums exactly the pv.string.power group.
    await cmdCoverage(validProfilePath);
    const out = io.out.join("\n");
    expect(out).toContain("Optimization hints:");
    expect(out).toContain('sumOf({ role: "pv.string.power" })');
  });

  test("refuses an invalid profile before reporting coverage", async () => {
    io = captureIo();
    await expect(cmdCoverage(brokenProfilePath)).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("fix validation first");
  });

  test("exits when the file does not exist", async () => {
    io = captureIo();
    await expect(cmdCoverage(join(dir, "missing.json"))).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("file not found");
  });
});

describe("cmdScaffold", () => {
  test("emits a scaffolded profile as JSON on stdout", async () => {
    io = captureIo();
    await cmdScaffold(csvPath, { id: "scaffolded", name: "S", manufacturer: "ACME" });
    const data = JSON.parse(io.out.join("\n")) as {
      id: string;
      version: string;
      metrics: unknown[];
    };
    expect(data.id).toBe("scaffolded");
    expect(data.version).toBe("0.1.0"); // default when --version omitted
    expect(data.metrics).toHaveLength(2);
  });

  test("requires id, name, and manufacturer", async () => {
    io = captureIo();
    await expect(cmdScaffold(csvPath, { id: "x" })).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("requires --id");
  });
});

describe("cmdBuild", () => {
  // A code-defined entry module: named export, wrapped export with description,
  // and a default-export array — all shapes cmdBuild should pick up.
  const modulePath = writeFixture(
    "repo-entry.ts",
    [
      `const base = ${JSON.stringify(deyeSg05lp3Data)};`,
      `export const one = { ...base, id: "one" };`,
      `export const two = { profile: { ...base, id: "two" }, description: "second" };`,
      `export default [{ ...base, id: "three" }];`,
    ].join("\n"),
  );

  test("builds index.json + profile files from a module and a json file", async () => {
    io = captureIo();
    const out = join(dir, "repo-out");
    await cmdBuild([modulePath, validProfilePath], { out, name: "My Repo" });

    const index = JSON.parse(await Bun.file(join(out, "index.json")).text()) as {
      name: string;
      profiles: { id: string; path: string; description?: string }[];
    };
    expect(index.name).toBe("My Repo");
    expect(index.profiles.map((p) => p.id)).toEqual([deyeSg05lp3Data.id, "one", "three", "two"]);
    expect(index.profiles.find((p) => p.id === "two")?.description).toBe("second");
    for (const entry of index.profiles) {
      expect(await Bun.file(join(out, entry.path)).exists()).toBe(true);
    }
    expect(io.out.join("\n")).toContain("wrote 4 profile(s)");
  });

  test("fails the build on duplicate ids across entries", async () => {
    io = captureIo();
    await expect(
      cmdBuild([validProfilePath, validProfilePath], { out: join(dir, "dupe-out") }),
    ).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("duplicate profile id");
  });

  test("requires --out and at least one entry", async () => {
    io = captureIo();
    await expect(cmdBuild([], {})).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("usage: profile build");

    io.restore();
    io = captureIo();
    await expect(cmdBuild([modulePath], {})).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("requires --out");
  });

  test("fails when a module exports no profiles", async () => {
    io = captureIo();
    const empty = writeFixture("no-profiles.ts", "export const x = 1;");
    await expect(cmdBuild([empty], { out: join(dir, "empty-out") })).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("no profiles exported");
  });

  test("auto-bumps a changed profile against the previous build in --out", async () => {
    const out = join(dir, "versioned-out");
    const v1 = writeFixture("v1.json", JSON.stringify({ ...deyeSg05lp3Data, version: "1.0.0" }));
    io = captureIo();
    await cmdBuild([v1], { out });
    io.restore();

    // Rebuild the same id with changed content (renamed) into the same out dir.
    const v2 = writeFixture(
      "v2.json",
      JSON.stringify({ ...deyeSg05lp3Data, version: "1.0.0", name: "Renamed" }),
    );
    io = captureIo();
    await cmdBuild([v2], { out });

    const published = JSON.parse(
      await Bun.file(join(out, `profiles/${deyeSg05lp3Data.id}.json`)).text(),
    ) as { version: string; name: string };
    expect(published.version).toBe("1.0.1");
    expect(io.out.join("\n")).toContain("bumped from 1.0.0");
  });

  test("rejects an invalid --bump level", async () => {
    io = captureIo();
    await expect(
      cmdBuild([validProfilePath], { out: join(dir, "bad-bump-out"), bump: "huge" }),
    ).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain('invalid --bump "huge"');
  });
});

describe("cmdInit", () => {
  // Non-interactive deps: never touch stdin, record any spawned commands.
  const silent = () => {
    const commands: string[][] = [];
    return {
      commands,
      deps: {
        prompt: () => "",
        confirm: () => false,
        run: async (command: string[]) => {
          commands.push(command);
          return true;
        },
        sdkVersion: "9.9.9",
      },
    };
  };

  test("scaffolds the project layout from flags without prompting", async () => {
    io = captureIo();
    const out = join(dir, "init-flags");
    const { commands, deps } = silent();
    await cmdInit(
      out,
      {
        pkg: "my-profiles",
        id: "acme-hybrid",
        manufacturer: "Acme",
        install: "false",
        git: "false",
      },
      deps,
    );

    for (const rel of ["package.json", "tsconfig.json", "src/profiles.ts", ".gitignore"]) {
      expect(existsSync(join(out, rel))).toBe(true);
    }
    const pkg = JSON.parse(await Bun.file(join(out, "package.json")).text()) as {
      name: string;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("my-profiles");
    expect(pkg.devDependencies["@sunreye/profile-sdk"]).toBe("^9.9.9");
    expect(commands).toEqual([]); // install/git disabled
    expect(io.out.join("\n")).toContain("scaffolded profile project");
  });

  test("runs bun install and git init when confirmed", async () => {
    io = captureIo();
    const out = join(dir, "init-confirm");
    const commands: string[][] = [];
    await cmdInit(
      out,
      { id: "x", manufacturer: "X" },
      {
        prompt: () => "",
        confirm: () => true,
        run: async (command: string[]) => {
          commands.push(command);
          return true;
        },
        sdkVersion: "1.0.0",
      },
    );
    expect(commands).toEqual([
      ["bun", "install"],
      ["git", "init"],
    ]);
  });

  test("refuses to overwrite an existing package.json", async () => {
    io = captureIo();
    const out = join(dir, "init-existing");
    await Bun.write(join(out, "package.json"), "{}");
    const { deps } = silent();
    await expect(cmdInit(out, { id: "x", manufacturer: "X" }, deps)).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("refusing to overwrite");
  });
});

describe("cmdUpgrade", () => {
  test("refuses to run outside a project (no package.json)", async () => {
    io = captureIo();
    const out = join(dir, "upgrade-empty");
    await Bun.write(join(out, ".keep"), "");
    await expect(cmdUpgrade(out, {})).rejects.toThrow("exit 1");
    expect(io.err.join("\n")).toContain("no package.json");
  });

  test("creates the guide files, then reports them up to date on a re-run", async () => {
    const out = join(dir, "upgrade-fresh");
    await Bun.write(join(out, "package.json"), "{}");

    io = captureIo();
    await cmdUpgrade(out, {});
    expect(existsSync(join(out, "AGENTS.md"))).toBe(true);
    expect(readFileSync(join(out, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
    expect(io.out.join("\n")).toContain("created");

    io.restore();
    io = captureIo();
    await cmdUpgrade(out, {});
    expect(io.out.join("\n")).toContain("up to date");
  });

  test("keeps an edited AGENTS.md unless --force", async () => {
    const out = join(dir, "upgrade-edited");
    await Bun.write(join(out, "package.json"), "{}");
    await Bun.write(join(out, "AGENTS.md"), "# my own guide\n");
    await Bun.write(join(out, "CLAUDE.md"), "@AGENTS.md\n");

    io = captureIo();
    await cmdUpgrade(out, {});
    expect(io.out.join("\n")).toContain("kept your edited copy");
    expect(readFileSync(join(out, "AGENTS.md"), "utf8")).toBe("# my own guide\n"); // untouched

    io.restore();
    io = captureIo();
    await cmdUpgrade(out, { force: "" });
    expect(readFileSync(join(out, "AGENTS.md"), "utf8")).toContain(
      "# Authoring SunReye inverter profiles",
    );
  });

  test("flags a CLAUDE.md that lacks the @AGENTS.md import without clobbering it", async () => {
    const out = join(dir, "upgrade-claude");
    await Bun.write(join(out, "package.json"), "{}");
    await Bun.write(join(out, "CLAUDE.md"), "# hand-written\n");

    io = captureIo();
    await cmdUpgrade(out, { force: "" });
    expect(io.out.join("\n")).toContain("needs a manual edit");
    expect(readFileSync(join(out, "CLAUDE.md"), "utf8")).toBe("# hand-written\n"); // preserved
  });
});
