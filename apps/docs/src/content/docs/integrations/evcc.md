---
title: EVCC
description: Show your EVCC-managed EV charger on the SunReye dashboard, over MQTT.
---

SunReye can surface an [EVCC](https://evcc.io/) instance's EV charger(s) on the dashboard:
an **EV node in the power-flow diagram** (branching off the house load), and an **EV card**
with live charge power, vehicle state of charge and range, session energy — plus
quick-settings for the charge mode and charge limit.

The data flows over MQTT: EVCC publishes its full state as retained topics and accepts
commands on `.../set` topics, so no EVCC login or API token is needed — only a shared
broker.

## Prerequisites

- A broker configured in [Settings → MQTT & Home Assistant](/use/settings/). Only the
  broker connection is reused — the **Enabled** toggle there (inverter→MQTT publishing) does
  not need to be on.
- EVCC publishing to that broker: an `mqtt` block in your `evcc.yaml`
  ([EVCC docs](https://docs.evcc.io/docs/reference/configuration/mqtt/)):

  ```yaml
  mqtt:
    broker: mqtt://your-broker:1883
    topic: evcc # SunReye's "topic root" must match this
    # user / password if your broker requires them
  ```

## Enabling

In [Settings → MQTT & Home Assistant](/use/settings/), scroll to the **EVCC** section:

1. Turn on **Enabled**.
2. Set the **topic root** to EVCC's `mqtt.topic` (default `evcc`).
3. Save. The subscription (re)connects live — no restart.

Once EVCC's retained state arrives, the EV card appears on the overview and the charger
node joins the power-flow diagram. Until then (EVCC offline, wrong topic root, EVCC not
publishing) both stay hidden.

## What you get

- **Power flow**: an EV node attached to the house-load node. The EV's draw is already part
  of the load figure, so it renders as a labeled sub-branch — the spine totals stay honest.
  With a single loadpoint, the vehicle's state of charge rings the node.
- **EV card** (one per loadpoint): status (charging / plugged in / disconnected), charge
  power, vehicle name, SoC and range, session energy, and the active charge mode.
- **Quick-settings** (admins only, tap the card): the four EVCC charge modes — Off, Solar,
  Min + Solar, Fast — and a charge-limit slider (`limitSoc`, 0 = no limit). Commands are
  published to EVCC's `/set` topics; the card reflects the new state as soon as EVCC
  republishes it (typically ~2 s).

## How it works

SunReye runs a dedicated MQTT client (independent of the inverter bridge) subscribed to:

| Topic | Purpose |
| --- | --- |
| `<root>/status` | EVCC's own online/offline (Last-Will) — drives reachability. |
| `<root>/loadpoints/#` | Retained per-loadpoint state (`chargePower`, `vehicleSoc`, …). |

Commands go to `<root>/loadpoints/<n>/mode/set` and `<root>/loadpoints/<n>/limitSoc/set`.

Because EVCC retains its state topics, SunReye has a complete snapshot within a second of
connecting. If the broker drops or EVCC's status flips to `offline`, the dashboard hides
the EV surfaces instead of showing stale data.
