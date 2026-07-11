import { defineProfile, hydrateProfile, registerProfile } from "@SunReye/inverter-core";
import type { InverterProfile, ProfileData } from "@SunReye/inverter-core";

import { metrics } from "./metrics";
import { simulate } from "./simulate";

/**
 * Deye SG05LP3 hybrid inverter profile (the Sunsynk badge of the same
 * SG05LP3 hardware shares this register layout).
 *
 * The register + semantic map is authored as serializable {@link ProfileData}
 * (`deyeSg05lp3Data`) — the exact shape a downloaded profile ships — and
 * hydrated into the runtime profile with a first-party coherent `simulate` hook
 * (a privilege of a trusted in-tree package; downloaded data profiles fall back
 * to generic synthesis). Importing this package self-registers the profile, so
 * the server only needs `import "@SunReye/inverter-deye-sg05lp3"` to make it
 * selectable via `INVERTER_PROFILE=deye-sg05lp3`.
 */
export const deyeSg05lp3Data: ProfileData = defineProfile({
  id: "deye-sg05lp3",
  name: "Deye SG05LP3",
  manufacturer: "Deye",
  version: "1.0.0",
  metrics,
});

export const deyeSg05lp3: InverterProfile = registerProfile(
  hydrateProfile(deyeSg05lp3Data, { simulate }),
);

export { metrics } from "./metrics";
export default deyeSg05lp3;
