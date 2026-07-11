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
