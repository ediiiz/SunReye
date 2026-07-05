---
title: MQTT Bridge
description: Publish every entity to MQTT topics and accept writes, generated from the profile.
---

The MQTT bridge publishes every entity to a broker as retained topics, subscribes to write
topics for writable entities, and reports availability via a Last-Will message. Like every
other surface, the topic set is generated from the active inverter's manifest.

## Enabling

Configure MQTT from [Settings → MQTT & Home Assistant](/use/settings/) (recommended), or
seed it from [environment variables](/reference/environment/) (`MQTT_ENABLED`,
`MQTT_BROKER_URL`, `MQTT_TOPIC_PREFIX`, `MQTT_USERNAME`, `MQTT_PASSWORD`).

Enabling, disabling, or changing the config takes effect **live** — the bridge is rebuilt
without a restart. The Settings tab has a **Test connection** button and a live status
badge.

## Topic layout

All topics are rooted at `<prefix>/<inverterId>`, where `prefix` defaults to `sunreye` and
`inverterId` is the active profile's id.

| Topic | Direction | Retained | Payload |
| --- | --- | --- | --- |
| `<prefix>/<inverterId>/<topic>` | publish (state) | ✅ | The entity's value as a string. |
| `<prefix>/<inverterId>/<topic>/set` | subscribe (write) | — | A numeric value to write. |
| `<prefix>/<inverterId>/status` | publish (availability) | ✅ | `online` / `offline`. |

`<topic>` is each entity's manifest topic (a `/`-separated suffix). State is published only
while connected — stale samples are not queued.

## Writes

Only writable entities get a `.../set` command topic. When a message arrives:

1. The payload is parsed as a number (`NaN` is rejected and logged).
2. The value is validated against the entity's constraint (range or enum) — the **same
   validation** used by the [REST API](/integrations/rest-api/) and the dashboard.
3. On success the write is pushed to the inverter; invalid writes are dropped with a warning.

Example (publish a new max charge current):

```bash
mosquitto_pub -t 'sunreye/deye-sunsynk/settings/battery/max_charge_current/set' -m '40'
```

## Availability (Last-Will)

- On connect, the bridge publishes `online` (retained) to `<prefix>/<inverterId>/status`.
- A broker-registered **Last-Will** publishes `offline` (retained) if the connection drops.
- On graceful shutdown it publishes `offline` before disconnecting.

Home Assistant uses this topic for entity availability.

## Home Assistant

When Home Assistant discovery is enabled, the bridge also publishes MQTT Discovery configs
so SunReye auto-populates in Home Assistant. See [Home Assistant](/integrations/home-assistant/).
