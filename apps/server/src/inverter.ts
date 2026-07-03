import { env } from "@ReyeON/env/server";
import { createInverter, getProfile } from "@ReyeON/inverter-core";
import type { InverterProfile, InverterSample, InverterSource } from "@ReyeON/inverter-core";
// Side-effect import: installing the package self-registers its profile into
// the inverter-core registry. Add more `@ReyeON/inverter-*` imports here to
// "download" additional inverter support.
import "@ReyeON/inverter-deye-sunsynk";

/** Profile selected by env, resolved from the installed profile packages. */
export const profile: InverterProfile = getProfile(env.INVERTER_PROFILE);

/** Live source: simulator or real Modbus TCP, chosen by INVERTER_SIMULATE. */
export const inverter: InverterSource = createInverter(profile, {
  simulate: env.INVERTER_SIMULATE,
  connection: {
    host: env.INVERTER_HOST,
    port: env.INVERTER_PORT,
    unitId: env.INVERTER_UNIT_ID,
  },
});

// fallow-ignore-next-line unused-type
export type { InverterSample };
