// Row shapes shared by the profiles settings form and its sub-components.

export type RegisteredProfile = {
  id: string;
  name: string;
  manufacturer: string;
  active: boolean;
  installed: boolean;
  /** Shipped in-repo (registered but not downloaded); shown as "Built in". */
  builtin: boolean;
  version?: string;
};

export type Source = { url: string; label?: string; enabled: boolean };

// Mirrors `OFFICIAL_SOURCE_URL` / `isOfficialSource` in @SunReye/db/profiles
// (the server is the source of truth). Duplicated so the web app doesn't take a
// dependency on the db package, matching the custom-charts precedent. The
// official source is protected: it can be disabled but not removed.
const OFFICIAL_SOURCE_URL = "https://github.com/SunReye/SunReye-Official-Profiles";
const normalizeGitUrl = (u: string): string =>
  u
    .trim()
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
export function isOfficialSource(url: string): boolean {
  return normalizeGitUrl(url) === normalizeGitUrl(OFFICIAL_SOURCE_URL);
}

/** An installed profile with a newer release waiting in its source repo. */
export type ProfileUpdate = {
  id: string;
  name: string;
  manufacturer: string;
  source: string;
  installedVersion: string;
  latestVersion: string;
};

export type AvailableProfile = {
  id: string;
  name: string;
  manufacturer: string;
  version: string;
  path: string;
  description?: string;
  source: string;
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
};

/** One inverter family (shared register base + its SKU models) within a manufacturer. */
export type FamilyGroup = { key: string; label: string; profiles: AvailableProfile[] };

/** Available profiles bucketed by manufacturer, then by family, for the browser UI. */
export type ManufacturerGroup = {
  manufacturer: string;
  families: FamilyGroup[];
  count: number;
};
