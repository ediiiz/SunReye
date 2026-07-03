import { registerProfile } from "@ReyeON/inverter-core";
import type { InverterProfile } from "@ReyeON/inverter-core";

import { metrics } from "./metrics";
import { simulate } from "./simulate";

/**
 * Deye / Sunsynk hybrid inverter profile.
 *
 * Importing this package self-registers the profile into the inverter-core
 * registry, so the server only needs to `import "@ReyeON/inverter-deye-sunsynk"`
 * to make it selectable via `INVERTER_PROFILE=deye-sunsynk`.
 */
export const deyeSunsynk: InverterProfile = registerProfile({
  id: "deye-sunsynk",
  name: "Deye / Sunsynk Hybrid",
  manufacturer: "Deye",
  metrics,
  simulate,
});

export { metrics } from "./metrics";
export default deyeSunsynk;
