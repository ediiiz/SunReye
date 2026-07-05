---
title: Profiles as Data
description: How an inverter profile drives every surface in SunReye.
---

An **inverter profile** is the single description SunReye builds everything from. It is
**pure data** — a Modbus register map plus semantic metadata — and from it the dashboard,
the REST API, the MQTT topics, and Home Assistant discovery all generate themselves.

## What a profile contains

A profile (`ProfileData`) is:

```ts
{
  schemaVersion: 1,
  id: "deye-sunsynk",          // lowercase slug
  name: "Deye / Sunsynk",
  manufacturer: "Deye",
  version: "1.0.0",            // semver of the profile content
  metrics: MetricDataDef[],    // one entry per value the inverter exposes
}
```

Each **metric** describes one value: where to read it (Modbus register `addresses` and a
`type` like `U_WORD` / `S_WORD` / `U_DWORD`), how to interpret it (`scale`, `unit`), whether
it's writable (`access`), and — crucially — what it *means*.

## The role catalog

Meaning is expressed with a **role** drawn from a closed catalog of canonical, inverter-
agnostic concepts (`CanonicalRole`) — the ~50 concepts the UI knows how to render:

- `pv.string.power`, `pv.total.power`, `production.today` …
- `battery.soc`, `battery.power`, `battery.temperature` …
- `grid.power`, `grid.phase.voltage`, `grid.energy.imported.total` …
- `load.power`, `generator.power`, `inverter.status` …
- `setting.battery.max_charge_current`, `setting.work_mode` …

Each role carries expectations. An **indexed** role (like `pv.string.power`) requires an
`index`; a **status** role requires `enumLabels`; a **setting** role must be writable
(`access: "rw"`) and carry a `range`. These rules live in one place —
`ROLE_CATALOG` — and drive authoring autocomplete, validation, *and* what the UI draws.

A metric with **no role** is still valid — it's kept as a diagnostic value, just not
rendered by role in the dashboard.

## From roles to capabilities

At boot, SunReye derives a **capabilities** object from which roles are present:

- Counting `pv.string.power` indices → the number of PV strings shown.
- Presence of `battery.*` roles → the battery section, gauge, and flow node.
- `grid.phase.*` indices → 1-phase vs 3-phase grid rendering.
- `generator.*`, `load.*` → generator and backup-load sections.
- Writable metrics → the Controls screen and REST/MQTT write routes.
- Special features (`solar_sell`, `grid_charge`, `time_of_use`) → the relevant editors.

This is why **no vendor-specific code lives in the UI**: every widget resolves by role, and
the whole render tree follows from the profile.

## Data, not code — why it matters

Because a profile is data:

- **New hardware is added as data**, never a fork of the engine.
- **Metrics are stored narrow** (one row per metric per tick), so a new inverter needs no
  database migration.
- **Profiles can be [downloaded at runtime](/profiles/distribution/)** — there is no code
  to execute, so the entire threat surface is malformed data, fully contained by
  [validation](/profiles/authoring/#validation).

Derived values (totals, deltas) that used to need code are expressed as a small, closed set
of declarative **compute expressions** (`sum` / `diff` / `scale`) — never arbitrary
functions.

## Next

- [Author a profile](/profiles/authoring/) with the typed SDK.
- [Distribute profiles](/profiles/distribution/) via git repos.
- See [Supported Inverters](/profiles/supported/).
