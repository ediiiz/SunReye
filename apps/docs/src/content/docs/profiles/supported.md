---
title: Supported Inverters
description: Which inverters SunReye ships support for, and how support grows.
---

Because inverters are [data, not code](/profiles/concept/), "supported" means "a profile
exists." SunReye ships one first-party profile and can load more at runtime.

## First-party

### Deye / Sunsynk hybrid

The `deye-sg05lp3` profile ships in the box (`packages/inverter-deye-sg05lp3`) and
self-registers on import. It covers roughly **99 metrics** (≈38 writable), including:

- PV strings (power / voltage / current per string)
- Battery (SoC, power, voltage, current, temperature, charged/discharged energy)
- Grid (per-phase voltage/current/power, imported/exported energy)
- Backup load and generator
- Inverter status and temperatures
- Writable settings: charge/discharge currents, work mode, grid charge, solar-sell, and a
  6-slot **time-of-use** schedule

As a first-party package it also ships a coherent **simulator**, so it runs with realistic
fake data out of the box.

It's the default active profile (`INVERTER_PROFILE=deye-sg05lp3`).

## Adding more

There are two ways support grows — both add **data**, never engine forks:

1. **Downloadable profiles** — browse and install profiles from git-hosted repositories at
   runtime, no redeploy. See [Distributing Profiles](/profiles/distribution/).
2. **Author your own** — describe any Modbus inverter with the typed profile SDK and either
   run it locally or publish it to a repo. See [Authoring a Profile](/profiles/authoring/).

If your inverter speaks Modbus TCP (or RTU-over-TCP through a gateway) and you have its
register map, you can write a profile for it. See the [Roadmap](/reference/roadmap/) for
what's planned around multi-inverter support and community profiles.
