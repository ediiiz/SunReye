/**
 * Command implementations for the `profile` CLI, separated from the argv
 * dispatch in ./cli so they can be unit-tested (the dispatch runs at import).
 * Failure paths print to stderr and `process.exit(1)` — same contract the CLI
 * always had; tests stub `process.exit`.
 */

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { coverage, groupByPrefix, isIndexedRole } from "./coverage";
import { buildRepo, type RepoEntryInput } from "./repo";
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

/**
 * Loose shape check used to pick profile exports out of a module — full
 * validation happens in `buildRepo`, so a broken profile is reported as a
 * validation error instead of silently skipped here.
 */
function isProfileLike(value: unknown): value is ProfileData {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ProfileData).schemaVersion === 1 &&
    typeof (value as ProfileData).id === "string" &&
    Array.isArray((value as ProfileData).metrics)
  );
}

/**
 * Collect profiles from one entry file: a `.json` file is a single serialized
 * profile; anything else is imported as a module and every export (including
 * array elements and `{ profile, description }` wrappers) that looks like a
 * profile is taken.
 */
async function loadEntry(path: string): Promise<RepoEntryInput[]> {
  if (path.endsWith(".json")) {
    return [{ profile: (await readJson(path)) as ProfileData }];
  }
  const mod: Record<string, unknown> = await import(pathToFileURL(resolve(path)).href);
  const found: RepoEntryInput[] = [];
  // Dedupe by identity: `export const x` + `export default x` is one profile.
  const taken = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object" || value === null || taken.has(value)) return;
    if (isProfileLike(value)) {
      taken.add(value);
      found.push({ profile: value });
      return;
    }
    const wrapper = value as Partial<RepoEntryInput>;
    if (isProfileLike(wrapper.profile) && !taken.has(wrapper.profile)) {
      taken.add(wrapper.profile);
      found.push({ profile: wrapper.profile, description: wrapper.description });
    }
  };
  for (const value of Object.values(mod)) visit(value);
  if (found.length === 0) fail(`no profiles exported from ${path}`);
  return found;
}

export async function cmdBuild(paths: string[], opts: Record<string, string>): Promise<void> {
  if (paths.length === 0) {
    fail(
      "usage: profile build <module.ts|profile.json ...> --out <dir> [--name n] [--maintainer m]",
    );
  }
  const out = opts.out;
  if (!out) fail("build requires --out <dir>");

  const entries: RepoEntryInput[] = [];
  for (const path of paths) entries.push(...(await loadEntry(path)));

  const result = buildRepo(entries, { name: opts.name, maintainer: opts.maintainer });
  if (!result.ok) {
    console.error("✗ repo build failed:");
    for (const issue of result.issues) console.error(`  • ${issue}`);
    process.exit(1);
  }

  for (const [relPath, contents] of Object.entries(result.files)) {
    await Bun.write(join(out, relPath), contents);
  }
  console.log(`✓ wrote ${result.index.profiles.length} profile(s) + index.json to ${out}`);
  for (const entry of result.index.profiles) {
    console.log(`  • ${entry.id}@${entry.version} → ${entry.path}`);
  }
}
