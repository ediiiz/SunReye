/**
 * Minimal semver handling for profile version strings. Profile `version`s are
 * free-form strings (see {@link ./schema}) but are expected to be semver
 * ("1.2.3", "v1.2.3", "1.2.3-beta.1"). We compare them to decide when a repo
 * genuinely offers a *newer* release rather than merely a different string — so
 * a downgrade never surfaces as an available update — and bump them so the
 * authoring SDK can own versioning.
 *
 * Build metadata (`+…`) is ignored per the semver spec. Anything that isn't
 * valid semver is left to the caller's fallback via a `null` compare result.
 */

export interface SemverParts {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers, empty for a normal release. */
  prerelease: string[];
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Parse a version string into its parts, or `null` when not valid semver. */
export function parseSemver(version: string): SemverParts | null {
  const m = SEMVER_RE.exec(version.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
  };
}

function comparePrereleaseId(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  // Numeric identifiers always have lower precedence than alphanumeric ones.
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePrerelease(a: string[], b: string[]): number {
  // A normal release outranks any prerelease of the same core version.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const cmp = comparePrereleaseId(a[i]!, b[i]!);
    if (cmp !== 0) return cmp;
  }
  // All shared identifiers equal: the longer prerelease set wins.
  return a.length - b.length;
}

/**
 * Compare two version strings. Returns a negative/zero/positive number like an
 * `Array.sort` comparator, or `null` when either string isn't valid semver.
 */
export function compareSemver(a: string, b: string): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/**
 * True when `candidate` is a newer release than `current`. Falls back to a plain
 * string inequality when either side isn't valid semver, so repos using an
 * unconventional versioning scheme still register that *something* changed.
 */
export function isNewerVersion(current: string, candidate: string): boolean {
  const cmp = compareSemver(candidate, current);
  if (cmp === null) return current !== candidate;
  return cmp > 0;
}

export type BumpLevel = "major" | "minor" | "patch";

/**
 * Increment a version at the given level, dropping any prerelease/build tags.
 * Returns `null` when `version` isn't valid semver (the caller must decide how
 * to handle an unversionable profile).
 */
export function bumpVersion(version: string, level: BumpLevel): string | null {
  const p = parseSemver(version);
  if (!p) return null;
  if (level === "major") return `${p.major + 1}.0.0`;
  if (level === "minor") return `${p.major}.${p.minor + 1}.0`;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}
