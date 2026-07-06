/**
 * Command implementations for the `profile` CLI, separated from the argv
 * dispatch in ./cli so they can be unit-tested (the dispatch runs at import).
 * Failure paths print to stderr and `process.exit(1)` — same contract the CLI
 * always had; tests stub `process.exit`.
 */

import { coverage, groupByPrefix, isIndexedRole } from "./coverage";
import { scaffoldFromCsv } from "./scaffold";
import { validateProfile } from "./validate";
import type { ProfileData } from "@SunReye/inverter-core";

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
export function flags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = args[++i] ?? "";
  }
  return out;
}

export async function cmdValidate(path: string | undefined): Promise<void> {
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

export async function cmdCoverage(path: string | undefined): Promise<void> {
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

export async function cmdScaffold(
  path: string | undefined,
  opts: Record<string, string>,
): Promise<void> {
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
