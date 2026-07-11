/**
 * Profile catalog + install service. Sits over the git-repo client
 * ({@link ./git-source}) and the `installed_profiles` table: browse profiles
 * across the configured git sources, download (validate + persist) one, and
 * manage the source list + active profile.
 *
 * Installing persists the validated `ProfileData` to the DB; it becomes
 * registered and selectable on the next restart (the active profile is a boot
 * concern — see {@link @SunReye/db/profiles}).
 */

import { db } from "@SunReye/db";
import {
  ACTIVE_PROFILE_KEY,
  LEGACY_DEFAULT_SOURCE_URL,
  PROFILE_SOURCES_KEY,
  activeProfileSchema,
  profileSourcesSchema,
  type ProfileSources,
} from "@SunReye/db/profiles";
import { installedProfiles } from "@SunReye/db/schema/settings";
import type { ProfileData } from "@SunReye/inverter-core";
import { eq } from "drizzle-orm";
import { readSetting, writeSetting } from "./app-settings";
import { readIndex, readProfile, type RepoProfileEntry, syncRepo } from "./git-source";
import { log } from "./logging";

const logger = log("profiles");

/** The configured git repo sources (none by default — added manually). */
export function getProfileSources(): Promise<ProfileSources> {
  return readSetting(PROFILE_SOURCES_KEY, profileSourcesSchema, profileSourcesSchema.parse({}));
}

export async function setProfileSources(input: unknown): Promise<ProfileSources> {
  const parsed = profileSourcesSchema.parse(input);
  await writeSetting(PROFILE_SOURCES_KEY, parsed);
  return parsed;
}

/**
 * One-time seed migration: early builds seeded a hardcoded default source
 * ({@link LEGACY_DEFAULT_SOURCE_URL}) that points at a repo which never existed.
 * Drop it from already-deployed DBs so it doesn't linger as a dead, un-browsable
 * source. No-op once removed (and on fresh installs, which now start empty).
 */
export async function dropLegacyDefaultSource(): Promise<void> {
  const { sources } = await getProfileSources();
  const kept = sources.filter((s) => s.url !== LEGACY_DEFAULT_SOURCE_URL);
  if (kept.length === sources.length) return;
  await setProfileSources({ sources: kept });
  logger.info("dropped stale default profile source {url}", { url: LEGACY_DEFAULT_SOURCE_URL });
}

/** Persist the active profile id (takes effect on the next restart). */
export async function setActiveProfile(input: unknown): Promise<{ id: string }> {
  const parsed = activeProfileSchema.parse(input);
  await writeSetting(ACTIVE_PROFILE_KEY, parsed);
  return parsed;
}

export interface InstalledProfileSummary {
  id: string;
  name: string;
  manufacturer: string;
  version: string;
  source: string;
  installedAt: string;
}

/** Summaries of the DB-installed profiles (identity read from the stored blob). */
export async function listInstalled(): Promise<InstalledProfileSummary[]> {
  const rows = await db.select().from(installedProfiles);
  return rows.map((r) => {
    const data = r.data as ProfileData;
    return {
      id: r.id,
      name: data.name,
      manufacturer: data.manufacturer,
      version: r.version,
      source: r.source,
      installedAt: r.installedAt.toISOString(),
    };
  });
}

export interface AvailableProfile extends RepoProfileEntry {
  /** The git source this entry came from. */
  source: string;
  installed: boolean;
  installedVersion?: string;
  /** The repo has a different version than what's installed. */
  updateAvailable: boolean;
}

/**
 * Browse every enabled source: clone/pull each repo, read its `index.json`, and
 * annotate each entry against the installed set. A source that fails to sync or
 * parse is reported in `errors` rather than failing the whole browse.
 */
export async function browseAvailable(): Promise<{
  profiles: AvailableProfile[];
  errors: { source: string; error: string }[];
}> {
  const { sources } = await getProfileSources();
  const rows = await db.select().from(installedProfiles);
  const installedById = new Map(rows.map((r) => [r.id, r]));

  const profiles: AvailableProfile[] = [];
  const errors: { source: string; error: string }[] = [];
  for (const src of sources) {
    if (!src.enabled) continue;
    try {
      const dir = await syncRepo(src.url);
      const index = await readIndex(dir);
      for (const p of index.profiles) {
        const installed = installedById.get(p.id);
        profiles.push({
          ...p,
          source: src.url,
          installed: installed !== undefined,
          installedVersion: installed?.version,
          updateAvailable: installed !== undefined && installed.version !== p.version,
        });
      }
    } catch (error) {
      errors.push({
        source: src.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { profiles, errors };
}

/** Download, validate, and persist one profile from a source. */
export async function installProfile(
  sourceUrl: string,
  id: string,
): Promise<{ id: string; version: string }> {
  const dir = await syncRepo(sourceUrl);
  const index = await readIndex(dir);
  const entry = index.profiles.find((p) => p.id === id);
  if (!entry) throw new Error(`profile "${id}" not found in ${sourceUrl}`);

  const data = await readProfile(dir, entry.path); // strict validation happens here
  if (data.id !== id) {
    throw new Error(`profile id mismatch: index lists "${id}" but file declares "${data.id}"`);
  }

  await db
    .insert(installedProfiles)
    .values({ id: data.id, source: sourceUrl, version: data.version, data })
    .onConflictDoUpdate({
      target: installedProfiles.id,
      set: { source: sourceUrl, version: data.version, data, installedAt: new Date() },
    });

  logger.info('installed profile "{id}" v{version} from {source}', {
    id: data.id,
    version: data.version,
    source: sourceUrl,
  });
  return { id: data.id, version: data.version };
}

/** Remove an installed profile. */
export async function uninstallProfile(id: string): Promise<void> {
  await db.delete(installedProfiles).where(eq(installedProfiles.id, id));
  logger.info('uninstalled profile "{id}"', { id });
}
