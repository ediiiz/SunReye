import { defineProfile, hydrateProfile, registerProfile } from "@SunReye/inverter-core";
import type { InverterProfile, ProfileData } from "@SunReye/inverter-core";

import { metrics } from "./metrics";
import { simulate } from "./simulate";

/**
 * Deye / Sunsynk hybrid inverter profile.
 *
 * The register + semantic map is authored as serializable {@link ProfileData}
 * (`deyeSunsynkData`) — the exact shape a downloaded profile ships — and
 * hydrated into the runtime profile with a first-party coherent `simulate` hook
 * (a privilege of a trusted in-tree package; downloaded data profiles fall back
 * to generic synthesis). Importing this package self-registers the profile, so
 * the server only needs `import "@SunReye/inverter-deye-sunsynk"` to make it
 * selectable via `INVERTER_PROFILE=deye-sunsynk`.
 */
export const deyeSunsynkData: ProfileData = defineProfile({
  id: "deye-sunsynk",
  name: "Deye / Sunsynk Hybrid",
  manufacturer: "Deye",
  version: "1.0.0",
  metrics,
});

export const deyeSunsynk: InverterProfile = registerProfile(
  hydrateProfile(deyeSunsynkData, { simulate }),
);

export { metrics } from "./metrics";
export default deyeSunsynk;
