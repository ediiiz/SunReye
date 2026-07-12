import { defineFamily, hydrateProfile, registerProfile } from "@SunReye/inverter-core";
import type { InverterProfile, ProfileData } from "@SunReye/inverter-core";

import { metrics, models } from "./metrics";
import { simulate } from "./simulate";

/**
 * Deye SG05LP3 hybrid inverter family (the Sunsynk badge of the same SG05LP3
 * hardware shares this register layout).
 *
 * The shared register + semantic map is authored as serializable
 * {@link ProfileData} (the exact shape a downloaded profile ships) via
 * `defineFamily`, which emits the generic base profile (`deye-sg05lp3`,
 * unchanged and still selectable) followed by one self-contained profile per
 * SKU (see {@link models}). Each SKU is a keyed overlay of per-model tweaks — a
 * tighter battery current ceiling — so "pick your model" in the UI swaps the
 * manifest and its `range` bounds (control-row sliders + `validateWrite`) follow
 * automatically. No schema, hydrate, or server change is involved.
 *
 * Importing this package self-registers every profile, so the server only needs
 * `import "@SunReye/inverter-deye-sg05lp3"` to make them selectable via
 * `INVERTER_PROFILE=deye-sun15k-sg05lp3` (etc.).
 */
export const deyeSg05lp3Family: ProfileData[] = defineFamily({
  id: "deye-sg05lp3",
  name: "SG05LP3",
  manufacturer: "Deye",
  version: "1.0.0",
  metrics,
  models,
});

/** The generic base profile — emitted first by {@link defineFamily}. */
export const deyeSg05lp3Data: ProfileData = deyeSg05lp3Family[0]!;

/** Register base + every model, each hydrated with the first-party simulate hook. */
const registered: InverterProfile[] = deyeSg05lp3Family.map((data) =>
  registerProfile(hydrateProfile(data, { simulate })),
);

/** The runtime base profile (kept as the package's default export, unchanged). */
export const deyeSg05lp3: InverterProfile = registered[0]!;

export { metrics } from "./metrics";
export default deyeSg05lp3;
