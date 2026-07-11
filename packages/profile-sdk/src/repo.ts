/**
 * Build a complete, servable profile repository from profiles defined as code:
 * one `profiles/<id>.json` per profile plus the root `index.json` SunReye reads
 * when browsing a source. Pure — returns the file set as data; the CLI (or the
 * author's own script) decides where to write it.
 */

import type { ProfileData, RepoIndex } from "@SunReye/inverter-core";

import { validateProfile } from "./validate";

/** A profile to include, optionally with the index-only description blurb. */
export interface RepoEntryInput {
  profile: ProfileData;
  /** Shown in SunReye's repo browser; `ProfileData` itself has no description. */
  description?: string;
}

export interface BuildRepoOptions {
  /** Optional repo display name for `index.json`. */
  name?: string;
  /** Optional maintainer for `index.json`. */
  maintainer?: string;
}

export interface RepoBuildResult {
  ok: boolean;
  /** `profiles[i] (id): message` lines; empty when ok. */
  issues: string[];
  index: RepoIndex;
  /** Repo-relative path → file contents (including `index.json`); empty when not ok. */
  files: Record<string, string>;
}

/**
 * Validate every profile and lay out the repo file set. Fails as a whole if any
 * profile is invalid or two profiles share an id — a repo with a broken entry
 * should never be published.
 */
export function buildRepo(
  entries: (ProfileData | RepoEntryInput)[],
  options: BuildRepoOptions = {},
): RepoBuildResult {
  const issues: string[] = [];
  const seen = new Map<string, number>();
  const index: RepoIndex = {
    ...(options.name ? { name: options.name } : {}),
    ...(options.maintainer ? { maintainer: options.maintainer } : {}),
    profiles: [],
  };
  const files: Record<string, string> = {};

  entries.forEach((entry, i) => {
    const { profile, description } = "profile" in entry ? entry : { profile: entry };
    const label = `profiles[${i}] (${profile?.id ?? "?"})`;
    const result = validateProfile(profile);
    if (!result.ok) {
      issues.push(...result.issues.map((issue) => `${label}: ${issue}`));
      return;
    }
    const first = seen.get(profile.id);
    if (first !== undefined) {
      issues.push(`${label}: duplicate profile id (already used by profiles[${first}])`);
      return;
    }
    seen.set(profile.id, i);
    const path = `profiles/${profile.id}.json`;
    index.profiles.push({
      id: profile.id,
      name: profile.name,
      manufacturer: profile.manufacturer,
      version: profile.version,
      path,
      ...(description ? { description } : {}),
    });
    files[path] = `${JSON.stringify(profile, null, 2)}\n`;
  });

  if (issues.length > 0) return { ok: false, issues, index: { profiles: [] }, files: {} };

  // Deterministic output regardless of input order — clean diffs on rebuild.
  index.profiles.sort((a, b) => a.id.localeCompare(b.id));
  files["index.json"] = `${JSON.stringify(index, null, 2)}\n`;
  return { ok: true, issues: [], index, files };
}
