# @sunreye/profile-sdk

Authoring SDK + CLI for [SunReye](https://github.com/ediiiz/SunReye) inverter profiles:
define a profile as typed code, compile it to serializable `ProfileData`, then validate,
score, and exercise it — all offline, no hardware required.

A profile is **pure data**. It can fail validation or produce an empty manifest, but it can
never execute code inside SunReye.

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

## Validate and exercise

```ts
import { validateProfile, coverage, exerciseProfile } from "@sunreye/profile-sdk";

const result = validateProfile(acme); // strict schema + semantic lints
const report = coverage(acme); // which canonical roles are mapped

// Run the profile end to end against the built-in simulator:
const { manifest, capabilities, sample } = await exerciseProfile(acme);
```

## The `profile` CLI

```sh
bunx profile validate ./profiles/acme.json    # strict validation + lints, non-zero exit on failure
bunx profile coverage ./profiles/acme.json    # role coverage report
bunx profile scaffold ./registers.csv --id acme-hybrid --name "Acme Hybrid" --manufacturer Acme
```

`validate` exits non-zero on failure, so it works as a CI or pre-commit gate.

## Distributing profiles

Serialize what `defineProfile` returns to JSON and host it in a public git repo with an
`index.json` — SunReye installs profiles from such repos at runtime. See the
[authoring guide](https://ediiiz.github.io/SunReye/profiles/authoring/) and
[distribution guide](https://ediiiz.github.io/SunReye/profiles/distribution/).

## License

[AGPL-3.0-only](https://github.com/ediiiz/SunReye/blob/master/LICENSE)
