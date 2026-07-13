/**
 * Build a complete, servable profile repository from profiles defined as code:
 * one `profiles/<id>.json` per profile plus the root `index.json` SunReye reads
 * when browsing a source. Pure — returns the file set as data; the CLI (or the
 * author's own script) decides where to write it.
 */

import {
  type BumpLevel,
  bumpVersion,
  isNewerVersion,
  type ProfileData,
  type RepoIndex,
} from "@SunReye/inverter-core";

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
  /**
   * Previously published profiles keyed by id (the last built `profiles/*.json`).
   * Enables change-aware versioning: a profile whose content changed is bumped,
   * one that didn't keeps its published version. Omit for a first build.
   */
  previous?: Map<string, ProfileData>;
  /** Level to auto-bump a changed profile by (default "patch"). */
  bump?: BumpLevel;
}

/** How {@link buildRepo} arrived at each profile's published version. */
export type VersionStatus = "new" | "unchanged" | "auto-bumped" | "author-bumped";

export interface VersionDecision {
  id: string;
  /** The version written to the built output. */
  version: string;
  /** The previously published version, if any. */
  previousVersion?: string;
  status: VersionStatus;
}

export interface RepoBuildResult {
  ok: boolean;
  /** `profiles[i] (id): message` lines; empty when ok. */
  issues: string[];
  index: RepoIndex;
  /** Repo-relative path → file contents (including `index.json`); empty when not ok. */
  files: Record<string, string>;
  /** Per-profile versioning outcome (sorted by id); empty when not ok. */
  versioning: VersionDecision[];
}

/**
 * Order-independent serialization of a profile's *content* — everything but its
 * `version` — so change detection ignores key ordering and version churn.
 */
function contentFingerprint(profile: ProfileData): string {
  const { version: _version, ...rest } = profile;
  return stableStringify(rest);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
  const bump = options.bump ?? "patch";
  const versioning: VersionDecision[] = [];

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

    const { decision, issue } = resolveVersion(profile, options.previous, bump);
    if (issue) {
      issues.push(`${label}: ${issue}`);
      return;
    }
    versioning.push(decision);

    // Emit the SDK-resolved version rather than the source's (which is only the
    // initial seed / a floor for author-directed bumps).
    const published =
      decision.version === profile.version ? profile : { ...profile, version: decision.version };
    const path = `profiles/${profile.id}.json`;
    index.profiles.push({
      id: profile.id,
      name: profile.name,
      manufacturer: profile.manufacturer,
      version: decision.version,
      path,
      ...(description ? { description } : {}),
    });
    files[path] = `${JSON.stringify(published, null, 2)}\n`;
  });

  if (issues.length > 0) {
    return { ok: false, issues, index: { profiles: [] }, files: {}, versioning: [] };
  }

  // Deterministic output regardless of input order — clean diffs on rebuild.
  index.profiles.sort((a, b) => a.id.localeCompare(b.id));
  versioning.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  files["index.json"] = `${JSON.stringify(index, null, 2)}\n`;
  return { ok: true, issues: [], index, files, versioning };
}

/**
 * Decide a profile's published version against the previously built output:
 *
 * - No previous build → the source `version` (the profile's initial version).
 * - Source raised above the published version → honored (an author-directed
 *   minor/major bump).
 * - Content unchanged → the published version is kept.
 * - Content changed → auto-bumped from the published version at `bump` level.
 *
 * A content change against a non-semver published version can't be auto-bumped,
 * so it surfaces an issue asking the author to set a semver version.
 */
function resolveVersion(
  profile: ProfileData,
  previous: Map<string, ProfileData> | undefined,
  bump: BumpLevel,
): { decision: VersionDecision; issue?: string } {
  const { id } = profile;
  const prev = previous?.get(id);
  if (!prev) return { decision: { id, version: profile.version, status: "new" } };

  const previousVersion = prev.version;
  if (isNewerVersion(previousVersion, profile.version)) {
    return { decision: { id, version: profile.version, previousVersion, status: "author-bumped" } };
  }
  if (contentFingerprint(profile) === contentFingerprint(prev)) {
    return { decision: { id, version: previousVersion, previousVersion, status: "unchanged" } };
  }
  const bumped = bumpVersion(previousVersion, bump);
  if (bumped === null) {
    return {
      decision: { id, version: previousVersion, previousVersion, status: "unchanged" },
      issue: `content changed but published version "${previousVersion}" is not semver — set a semver version to enable auto-bumping`,
    };
  }
  return { decision: { id, version: bumped, previousVersion, status: "auto-bumped" } };
}
