---
title: Authoring a Profile
description: Describe a new inverter with the typed profile SDK, validate it, and score its coverage.
---

You describe an inverter *as code* using the typed builders in
`@SunReye/inverter-core`, compile it down to a serializable `ProfileData`, then validate and
score it with the `@SunReye/profile-sdk` CLI. The SDK's job is to make the profile
**correct by construction** — picking a role forces you to supply exactly what that role
needs, or the code won't compile.

## `defineProfile` and `metric`

```ts
import { defineProfile, metric } from "@SunReye/inverter-core";

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
    metric("settings/work_mode", {
      label: "Work Mode", group: "settings",
      role: "setting.work_mode", access: "rw", addr: 142,
      enumLabels: { 0: "Selling First", 1: "Zero Export", 2: "Limited to Load" },
    }),
    metric("grid/total/power", {
      label: "Total Grid Power", group: "grid",
      computeExpr: { sum: ["grid.phase.power.1", "grid.phase.power.2"] },
    }),
  ],
});
```

`metric(topic, opts)` derives the entity `key` from the topic (`dc/pv1/power` →
`dc.pv1.power`) and defaults `type` (`U_WORD`), `scale` (`1`), `access` (`r`), and `unit`
(`null`) so the common case stays terse.

### The role makes the type demand its shape

The `role` you choose narrows what the rest of the argument must contain, read from the
[role catalog](/profiles/concept/#the-role-catalog):

- An **indexed** role (`pv.string.power`) ⇒ `index` is **required**.
- A **status/enum** role (`inverter.status`, `setting.work_mode`) ⇒ `enumLabels` is
  **required**.
- A **setting** (writable) role ⇒ `access: "rw"` is **required**.

Omit any of these and it's a compile error. A metric with **no role** is allowed — it's a
diagnostic value that isn't rendered by role.

### Addresses by register type

- `U_WORD` / `S_WORD` → one address: `addr: 672`
- `U_DWORD` → two addresses `[low, high]`: `addr: [672, 673]`
- computed (`computeExpr`) → no `addr`

### Compute expressions

Derived metrics use a small **closed** set — never arbitrary code:

| Expression | Meaning |
| --- | --- |
| `{ sum: ["a", "b", …] }` | Add the listed metric keys. |
| `{ diff: ["a", "b"] }` | `a − b`. |
| `{ scale: ["a", k] }` | `a × k`. |

A computed metric may only reference metrics defined **earlier** (no forward references).

## Validation

A single Zod schema is the gate for **every** ingested profile — at author time, at
download time, and at server boot. It is strict:

- unknown keys are rejected;
- addresses are bounded (0–65535) and their count must match the register `type`;
- **semantic lints**: duplicate keys, duplicate wire addresses, indexed role without
  `index`, enum role without `enumLabels`, setting role without `rw`, and `computeExpr`
  referencing unknown or forward keys.

Because a profile is pure data, a bad profile can only fail validation or produce an empty
manifest — **it can never execute code**.

## The `profile` CLI

`@SunReye/profile-sdk` ships a `profile` command with three subcommands. It exits non-zero
on failure, so it works as a CI or pre-commit gate.

### `profile validate <file>`

Runs the strict schema + semantic lints against a `ProfileData` JSON file. Prints `✓` or a
list of `• path: message` issues.

```bash
bunx profile validate ./profiles/acme.json
```

### `profile coverage <file>`

Validates, then reports how many canonical roles are mapped and which are missing —
directly telling you what *won't* render:

```
mapped 31/50 canonical roles
missing: grid.power, battery.soc, pv.string.power[] …
```

Indexed roles are marked with `[]`.

```bash
bunx profile coverage ./profiles/acme.json
```

### `profile scaffold <csv>`

Turns a vendor Modbus register-table CSV into a starter `ProfileData` (roles left unmapped
for you to fill in). Columns: `topic,label,unit,group,addr,type,scale,access` (order-
independent; `topic` required; multi-register `addr` is `|`-separated). Prints JSON to
stdout for piping and hand-editing:

```bash
bunx profile scaffold ./deye-registers.csv \
  --id acme-hybrid --name "Acme Hybrid" --manufacturer Acme --version 0.1.0 \
  > profiles/acme.json
```

The real authoring work is transcribing the register map and assigning roles; scaffold gives
you the skeleton.

## Testing without hardware

The SDK's test harness (`exerciseProfile`) runs a `ProfileData` end to end offline —
validate → hydrate → build the manifest → derive capabilities → generate one simulated
sample — so you can assert identity and capabilities in a unit test with **zero hardware**.

## Publishing

Once a profile validates and covers the roles you need, publish it to a git repo so others
can install it at runtime — see [Distributing Profiles](/profiles/distribution/).
