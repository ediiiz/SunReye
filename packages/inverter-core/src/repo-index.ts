/**
 * Wire format of a profile repository's root `index.json` — the manifest a
 * git-hosted profile repo commits alongside its `ProfileData` files. Shared by
 * the server (which fetches and parses it) and the profile SDK (which builds
 * it), so the two sides can never drift.
 */

import { z } from "zod";

/** One profile entry in a repo's root `index.json`. */
export const repoProfileEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  manufacturer: z.string().min(1),
  version: z.string().min(1),
  /** Repo-relative path to the ProfileData JSON, e.g. `profiles/deye.json`. */
  path: z.string().min(1),
  description: z.string().optional(),
});
export type RepoProfileEntry = z.infer<typeof repoProfileEntrySchema>;

export const repoIndexSchema = z.object({
  name: z.string().optional(),
  maintainer: z.string().optional(),
  profiles: z.array(repoProfileEntrySchema),
});
export type RepoIndex = z.infer<typeof repoIndexSchema>;
