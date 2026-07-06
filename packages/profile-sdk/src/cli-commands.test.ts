import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deyeSunsynkData } from "@SunReye/inverter-deye-sunsynk";

import { cmdCoverage, cmdScaffold, cmdValidate, flags } from "./cli-commands";

const dir = mkdtempSync(join(tmpdir(), "profile-cli-"));

function writeFixture(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const validProfilePath = writeFixture("deye.json", JSON.stringify(deyeSunsynkData));
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
