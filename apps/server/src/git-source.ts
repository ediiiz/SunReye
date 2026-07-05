/**
 * Git-backed profile repository client — the Home Assistant Supervisor
 * add-on-repo model. A "source" is a public git repo URL; we shallow-clone it
 * (or `git pull` an existing clone) into a disposable cache dir and read a root
 * `index.json` manifest listing the committed `ProfileData` files.
 *
 * The clone cache is never the source of truth — the chosen profile JSON is
 * copied into the `installed_profiles` table on download — so it can be wiped or
 * live on an ephemeral container FS with nothing lost. Only public `https` git
 * URLs are accepted (validated upstream in `@SunReye/db/profiles`); we re-check
 * here and guard against path traversal out of the clone dir.
 */

import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { env } from "@SunReye/env/server";
import type { ProfileData } from "@SunReye/inverter-core";
import { parseProfileData } from "@SunReye/inverter-core";
import { z } from "zod";

import { log } from "./logging";

const logger = log("git-source");

/** Where clones are cached. Disposable — see the module doc. */
const CACHE_ROOT = join(tmpdir(), "sunreye-profile-repos");

/** Hard limit on how long any git invocation may run. */
const GIT_TIMEOUT_MS = 30_000;

/** Refuse to parse a profile/index larger than this (defense against junk). */
const MAX_FILE_BYTES = 1_000_000;

/** One profile entry in a repo's root `index.json`. */
const repoProfileEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  manufacturer: z.string().min(1),
  version: z.string().min(1),
  /** Repo-relative path to the ProfileData JSON, e.g. `profiles/deye.json`. */
  path: z.string().min(1),
  description: z.string().optional(),
});
export type RepoProfileEntry = z.infer<typeof repoProfileEntrySchema>;

const repoIndexSchema = z.object({
  name: z.string().optional(),
  maintainer: z.string().optional(),
  profiles: z.array(repoProfileEntrySchema),
});
export type RepoIndex = z.infer<typeof repoIndexSchema>;

function assertAllowedGitUrl(url: string): void {
  if (url.startsWith("https://")) return;
  // `file://` is a local-only convenience for dev/tests; production sources are
  // https-only (enforced again at config time by `profileSourceSchema`).
  if (url.startsWith("file://") && env.NODE_ENV !== "production") return;
  throw new Error(`only https git URLs are allowed: ${url}`);
}

function cacheDirFor(url: string): string {
  return join(CACHE_ROOT, createHash("sha256").update(url).digest("hex").slice(0, 16));
}

/** Run a git subcommand with a hard timeout; throws on non-zero exit. */
async function git(args: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, // never block on a credential prompt
  });
  const timer = setTimeout(() => proc.kill(), GIT_TIMEOUT_MS);
  try {
    const code = await proc.exited;
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`git ${args[0]} failed (${code}): ${stderr.trim().slice(0, 500)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Clone the repo on first use, or update an existing clone. Returns the local
 * working-tree directory. A failed update wipes the cache and re-clones so a
 * corrupt clone can't wedge the source permanently.
 */
export async function syncRepo(url: string): Promise<string> {
  assertAllowedGitUrl(url);
  const dir = cacheDirFor(url);
  const exists = await Bun.file(join(dir, ".git", "HEAD")).exists();
  if (!exists) {
    await rm(dir, { recursive: true, force: true });
    await git(["clone", "--depth", "1", url, dir]);
    return dir;
  }
  try {
    await git(["fetch", "--depth", "1", "origin"], dir);
    await git(["reset", "--hard", "FETCH_HEAD"], dir);
  } catch (error) {
    logger.warn("update failed for {url}, re-cloning: {error}", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    await rm(dir, { recursive: true, force: true });
    await git(["clone", "--depth", "1", url, dir]);
  }
  return dir;
}

/** Read a repo-relative file, guarding against traversal and oversized files. */
async function readRepoFile(dir: string, relPath: string): Promise<string> {
  const full = resolve(dir, relPath);
  if (full !== dir && !full.startsWith(dir + "/")) {
    throw new Error(`path escapes repository: ${relPath}`);
  }
  const file = Bun.file(full);
  if (!(await file.exists())) throw new Error(`file not found in repo: ${relPath}`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`file too large: ${relPath}`);
  return file.text();
}

/** Parse and validate a repo's root `index.json`. */
export async function readIndex(dir: string): Promise<RepoIndex> {
  const raw = await readRepoFile(dir, "index.json");
  return repoIndexSchema.parse(JSON.parse(raw));
}

/** Read and strictly validate one profile file listed in the index. */
export async function readProfile(dir: string, relPath: string): Promise<ProfileData> {
  const raw = await readRepoFile(dir, relPath);
  return parseProfileData(JSON.parse(raw));
}
