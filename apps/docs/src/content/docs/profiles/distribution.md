---
title: Distributing Profiles
description: Host profiles in a git repo and install them into SunReye at runtime.
---

Profiles can be **downloaded and installed at runtime** from git-hosted repositories — no
redeploy, no `.env` edits, no code execution. Because a profile is
[pure data](/profiles/concept/), the only thing that ever gets fetched and stored is a
validated JSON blob.

## Repo wire format

A "repo" is a **public git repository** containing:

1. A root **`index.json`** listing the profiles it offers:

   ```json
   {
     "profiles": [
       {
         "id": "acme-hybrid",
         "name": "Acme Hybrid",
         "manufacturer": "Acme",
         "version": "1.0.0",
         "path": "profiles/acme.json",
         "description": "Acme 5–12 kW hybrid range"
       }
     ]
   }
   ```

2. One committed **`ProfileData` JSON file** per entry, at the `path` given in the index —
   exactly what [`defineProfile`](/profiles/authoring/) emits, serialized.

You don't have to write this layout by hand: `bunx profile build ./src/profiles.ts --out .`
[generates it](/profiles/authoring/#profile-build-entries---out-dir) from code-defined
profiles — validate, emit, commit, push.

**No source ships by default** — the core stays clean. Out of the box the only profiles
present are the **built-in** ones (shipped in-repo, badged "Built in" in the UI and selectable
directly). To pull external profiles, add a repository yourself. Source URLs must be
`https://` and end in `.git`.

## Managing sources

From [Settings → Profiles](/use/settings/) (admin only) you can:

- **Add / remove / enable repositories** — the "Profile repositories" section.
- **Browse** all enabled repos to see available profiles, each annotated with **installed**,
  **update available** (repo version ≠ installed version), or downloadable state.
- **Download** a profile — SunReye fetches its `ProfileData`, validates it, and stores it.
- **Set active** — choose which installed profile the server runs.
- **Remove** an installed profile (not the active one).

## What happens on the server

- Repos are **shallow-cloned** into a temp cache (`clone --depth 1`, or fetch + reset on
  update). The clone cache is disposable; the database is the source of truth.
- Downloaded profiles are re-validated with the strict schema and stored in the
  `installed_profiles` table (`id`, `source`, `version`, `data`, `installedAt`).
- Security guards: **https-only** URLs, a 30 s git timeout with terminal prompts disabled,
  path-traversal protection, and a 1 MB per-file cap. Since profiles are data-only, the
  worst a malicious repo can do is fail validation.

## Activation requires a restart

Installing a profile just persists a validated row. The **active** profile shapes the REST
routes, the manifest, and the MQTT topics — and those are built **once at boot**. So:

- Downloading a profile makes it *available* immediately.
- **Switching the active profile takes effect on the next restart**, and the Settings UI
  shows a persistent "Restart required" banner until then.

This is intentional — it keeps the boot model simple and avoids rebuilding every surface
live.

## Boot flow

On startup, profiles are registered in two phases before any routes or topics are built:

1. **Built-in packages** (like Deye) self-register on import.
2. **Installed profiles** are read from the database, each **re-validated** (a stored row may
   predate a schema change) and registered; an invalid row is logged and skipped, so one bad
   download can't take the server down.

Then the active profile id — from settings, or seeded from `INVERTER_PROFILE` — is resolved
and the engine is built for it. **When nothing is configured** (a fresh install), the server
boots in a degraded, **onboarding-only** mode: the admin picks a profile and tests the Modbus
connection with it from the first-run flow, then restarts into the full API.

## Non-goals

- **No hot-reload of the active profile** (restart-to-apply, above).
- **No executable code** in downloaded profiles — simulators and arbitrary `compute`
  closures remain the preserve of trusted first-party npm packages.
- **Not a general package manager** — a repo is just a git repo with an index and JSON
  files.
