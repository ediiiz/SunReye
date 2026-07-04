import type { InverterConfig } from "@ReyeON/db/inverter-config";
import { env } from "@ReyeON/env/server";
import { createInverter, getProfile } from "@ReyeON/inverter-core";
import type { InverterProfile, InverterSample, InverterSource } from "@ReyeON/inverter-core";
// Side-effect import: installing the package self-registers its profile into
// the inverter-core registry. Add more `@ReyeON/inverter-*` imports here to
// "download" additional inverter support.
import "@ReyeON/inverter-deye-sunsynk";

/**
 * Active profile, selected by env and fixed for the process: it shapes the REST
 * routes, manifest, and MQTT topics generated once at boot. Runtime settings
 * (connection, simulate, interval) live in the inverter config and change
 * without a restart; switching *profiles* is a boot concern (see P3).
 */
export const profile: InverterProfile = getProfile(env.INVERTER_PROFILE);

/** Build a live source — simulator or real Modbus TCP — for a config. */
export function buildSource(config: InverterConfig): InverterSource {
  return createInverter(profile, {
    simulate: config.simulate,
    connection: {
      host: config.host,
      port: config.port,
      unitId: config.unitId,
      timeoutMs: config.timeoutMs,
    },
  });
}

// fallow-ignore-next-line unused-type
export type { InverterSample };
