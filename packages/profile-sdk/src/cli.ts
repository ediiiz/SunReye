#!/usr/bin/env bun
/**
 * `profile` — authoring CLI for SunReye inverter profiles.
 *
 *   profile validate <file>            strict validation + semantic lints
 *   profile coverage <file>            which renderable roles are mapped
 *   profile scaffold <csv> --id <id> --name <n> --manufacturer <m> [--version v]
 *
 * Exits non-zero on validation failure so it's usable as a CI/pre-commit gate.
 */

import { coverage, groupByPrefix, isIndexedRole } from "./coverage";
import { scaffoldFromCsv } from "./scaffold";
import { validateProfile } from "./validate";
import type { ProfileData } from "@SunReye/inverter-core";

const [command, ...rest] = process.argv.slice(2);

async function readJson(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) fail(`file not found: ${path}`);
  return JSON.parse(await file.text());
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Parse `--flag value` pairs from the tail args. */
function flags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = args[++i] ?? "";
  }
  return out;
}

async function cmdValidate(path: string | undefined): Promise<void> {
  if (!path) fail("usage: profile validate <file>");
  const { ok, issues } = validateProfile(await readJson(path));
  if (ok) {
    console.log(`✓ ${path} is a valid profile`);
    return;
  }
  console.error(`✗ ${path} is invalid:`);
  for (const issue of issues) console.error(`  • ${issue}`);
  process.exit(1);
}

async function cmdCoverage(path: string | undefined): Promise<void> {
  if (!path) fail("usage: profile coverage <file>");
  const data = await readJson(path);
  const { ok, issues } = validateProfile(data);
  if (!ok) {
    console.error("✗ profile is invalid — fix validation first:");
    for (const issue of issues) console.error(`  • ${issue}`);
    process.exit(1);
  }
  const report = coverage(data as ProfileData);
  console.log(`Role coverage: ${report.mappedCount}/${report.total} canonical roles mapped\n`);
  if (report.missing.length === 0) {
    console.log("✓ every renderable role is mapped");
    return;
  }
  console.log("Unmapped roles (these UI areas render empty):");
  for (const [prefix, roles] of groupByPrefix(report.missing)) {
    const list = roles.map((r) => (isIndexedRole(r) ? `${r}[]` : r)).join(", ");
    console.log(`  ${prefix}: ${list}`);
  }
}

async function cmdScaffold(path: string | undefined, opts: Record<string, string>): Promise<void> {
  if (!path) fail("usage: profile scaffold <csv> --id <id> --name <name> --manufacturer <m>");
  if (!opts.id || !opts.name || !opts.manufacturer) {
    fail("scaffold requires --id, --name, and --manufacturer");
  }
  const csv = await Bun.file(path).text();
  const data = scaffoldFromCsv(csv, {
    id: opts.id,
    name: opts.name,
    manufacturer: opts.manufacturer,
    version: opts.version ?? "0.1.0",
  });
  // Emit to stdout so it can be piped to a file and hand-edited (add roles).
  console.log(JSON.stringify(data, null, 2));
}

switch (command) {
  case "validate":
    await cmdValidate(rest[0]);
    break;
  case "coverage":
    await cmdCoverage(rest[0]);
    break;
  case "scaffold":
    await cmdScaffold(rest[0], flags(rest.slice(1)));
    break;
  default:
    console.error("usage: profile <validate|coverage|scaffold> <file> [options]");
    process.exit(1);
}
