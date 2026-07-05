import {
  buildManifest,
  deriveCapabilities,
  hydrateProfile,
  parseProfileData,
  SimulatedInverter,
  type InverterCapabilities,
  type InverterManifest,
  type MetricValues,
  type ProfileData,
} from "@SunReye/inverter-core";

export interface HarnessResult {
  manifest: InverterManifest;
  capabilities: InverterCapabilities;
  /** One synthesized sample from the generic simulator (no hardware, no hook). */
  sample: MetricValues;
}

/**
 * Exercise a {@link ProfileData} end-to-end without hardware: validate it, build
 * its manifest + capabilities, and read one generic simulator sample. Lets a
 * profile author (or a test) assert identity/capabilities and confirm every
 * metric produces a value, all offline.
 */
export async function exerciseProfile(data: ProfileData): Promise<HarnessResult> {
  const profile = hydrateProfile(parseProfileData(data)); // throws on invalid input
  const manifest = buildManifest(profile);
  const capabilities = deriveCapabilities(profile);
  const sample = (await new SimulatedInverter(profile).read()).metrics;
  return { manifest, capabilities, sample };
}
