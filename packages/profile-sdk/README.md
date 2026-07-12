# @sunreye/profile-sdk

Authoring SDK + CLI for [SunReye](https://github.com/SunReye/SunReye) inverter profiles:
define a profile as typed code, compile it to serializable `ProfileData`, then validate,
score, and exercise it — all offline, no hardware required.

A profile is **pure data**. It can fail validation or produce an empty manifest, but it can
never execute code inside SunReye.

## Quick start

Scaffold a ready-to-build authoring project in one command — no install needed, works in an
empty directory:

```sh
bunx @sunreye/profile-sdk init my-profiles
```

It writes the project layout (`package.json`, `tsconfig.json`, `src/profiles.ts` with a
starter profile, `README.md`, `.gitignore`) and optionally runs `bun install` + `git init`,
leaving you one `bun run build` away from an installable repo. See
[Start a new profile project](#start-a-new-profile-project) for flags.

## Install

```sh
bun add -d @sunreye/profile-sdk
```

## Define a profile

```ts
import { defineProfile, metric } from "@sunreye/profile-sdk";

export const acme = defineProfile({
  id: "acme-hybrid",
  name: "Acme Hybrid",
  manufacturer: "Acme",
  version: "1.0.0",
  metrics: [
    metric("dc/pv1/power", {
      label: "PV1 Power", group: "solar",
      role: "pv.string.power", index: 1, addr: 672, unit: "W",
    }),
    metric("battery/soc", {
      label: "Battery SoC", group: "battery",
      role: "battery.soc", addr: 588, unit: "%",
    }),
  ],
});
```

Picking a role forces you to supply exactly what that role needs, or the code won't
compile — profiles are **correct by construction**.

## Families & model variants

One repo can hold **hundreds of profiles** (`index.json` + one `profiles/<id>.json` per
model). When several models share a register map and differ only in a few limits or PV
inputs, author them as a **family** instead of copying the map. `defineFamily` takes the
shared base plus a `models` record keyed by profile id, and returns `[base, ...models]` —
each a self-contained profile that shows up in SunReye's model picker:

```ts
import { defineFamily, metric } from "@sunreye/profile-sdk";

export const acme = defineFamily({
  id: "acme-hybrid",
  name: "Acme Hybrid",
  manufacturer: "Acme",
  version: "1.0.0",
  metrics: [ /* the shared register map — 2 PV strings, a writable discharge limit, … */ ],
  models: {
    "acme-hybrid-5k": {
      name: "Acme Hybrid 5K",
      metrics: {
        "dc.pv2.*": null,                                            // one MPPT → capabilities show 1
        "settings.battery.maximum_discharge_current": { max: 120 },  // 0–120 A slider + write clamp
      },
    },
    "acme-hybrid-15k": {
      name: "Acme Hybrid 15K",
      metrics: { "settings.battery.maximum_discharge_current": { max: 280 } },
    },
  },
});
```

The `models[id].metrics` overlay is keyed by canonical metric key with one rule per entry:

| Entry | Effect |
| --- | --- |
| `"key": { max: 280 }` (or `min`/any `metric()` field) | **patch** — merge into that metric; `min`/`max` set its `range` |
| `"key": null` | **remove** that metric |
| `"prefix.*": null` | **remove** every metric under the prefix (e.g. a PV string) |
| `"new.key": { …full definition… }` | **add** a new metric (topic derived from the key) |

Keys **autocomplete** from the base map; a mistyped patch/remove target throws at build
time (`profile build` validates every profile). Because capabilities are *derived* — string
count, phases, genset presence — removing metrics reshapes the
manifest and UI automatically, and a `range` on a writable setting becomes a capped slider
that also rejects out-of-range writes server-side. No schema, hydrate, or server change is
involved. `defineVariant(base, { id, … })` is the low-level primitive for specializing a
single imported/third-party `ProfileData`.

## Validate and exercise

```ts
import { validateProfile, coverage, exerciseProfile } from "@sunreye/profile-sdk";

const result = validateProfile(acme); // strict schema + semantic lints
const report = coverage(acme); // which canonical roles are mapped

// Run the profile end to end against the built-in simulator:
const { manifest, capabilities, sample } = await exerciseProfile(acme);
```

## Start a new profile project

```sh
bunx @sunreye/profile-sdk init my-profiles    # interactive: package + first profile stub, then optional install + git init
```

`init` scaffolds a ready-to-build authoring project (`package.json`, `tsconfig.json`,
`src/profiles.ts` with a starter profile, `README.md`, `.gitignore`), asks whether to run
`bun install` and `git init`, and leaves you one `bun run build` away from an installable
repo. Run it via the package name (`bunx @sunreye/profile-sdk`) so it works in an empty
directory before anything is installed; inside the scaffolded project the `profile` bin is
on the path. Pass flags to skip prompts, or `--yes` to accept every default:

```sh
bunx @sunreye/profile-sdk init my-profiles --id acme-hybrid --manufacturer Acme --repo-name "Acme Profiles" --yes
```

## The `profile` CLI

```sh
bunx @sunreye/profile-sdk init ./my-profiles   # scaffold a new authoring project (empty dir; no install needed)
bunx profile validate ./profiles/acme.json     # strict validation + lints, non-zero exit on failure
bunx profile coverage ./profiles/acme.json     # role coverage report
bunx profile scaffold ./registers.csv --id acme-hybrid --name "Acme Hybrid" --manufacturer Acme
bunx profile build ./src/profiles.ts --out . --name "My Profiles"   # emit installable repo
```

`validate` and `build` exit non-zero on failure, so they work as a CI or pre-commit gate.

## Build an installable profile repo

SunReye installs profiles at runtime from any public git repo containing an `index.json`
plus one `ProfileData` JSON file per profile. `profile build` generates exactly that layout
from your code-defined profiles:

```sh
bunx profile build ./src/profiles.ts --out . --name "My Profiles" --maintainer you
```

Every export of the entry module that is a profile (or a `{ profile, description }`
wrapper, or an array of either) is validated and written to `profiles/<id>.json`, and
`index.json` is regenerated — commit, push, and the repo is installable from
Settings → Profiles. Any invalid profile or duplicate id fails the whole build.

Same thing programmatically:

```ts
import { buildRepo } from "@sunreye/profile-sdk";

const { ok, issues, files } = buildRepo(
  [acme, { profile: zeta, description: "Zeta 3–6 kW range" }],
  { name: "My Profiles" },
);
// files: { "index.json": "...", "profiles/acme-hybrid.json": "...", ... }
```

See the [authoring guide](https://sunreye.github.io/SunReye/profiles/authoring/) and
[distribution guide](https://sunreye.github.io/SunReye/profiles/distribution/).

## License

[AGPL-3.0-only](https://github.com/SunReye/SunReye/blob/master/LICENSE)
