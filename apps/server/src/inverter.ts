import { db } from "@SunReye/db";
import type { InverterConfig } from "@SunReye/db/inverter-config";
import { ACTIVE_PROFILE_KEY, activeProfileSchema } from "@SunReye/db/profiles";
import { installedProfiles } from "@SunReye/db/schema/settings";
import { env } from "@SunReye/env/server";
import {
  buildManifest,
  createInverter,
  entityConstraint,
  getProfile,
  hydrateProfile,
  metricByKey,
  parseProfileData,
  registerProfile,
} from "@SunReye/inverter-core";
import type {
  InverterManifest,
  InverterProfile,
  InverterSample,
  InverterSource,
  ManifestMetric,
  MetricDef,
} from "@SunReye/inverter-core";
// Side-effect import: installing the package self-registers its profile into
// the inverter-core registry. Add more `@SunReye/inverter-*` imports here to
// ship additional inverter support in the box; downloaded profiles are loaded
// from the database by `loadInstalledProfiles` at boot.
import "@SunReye/inverter-deye-sunsynk";
import { readSetting } from "./app-settings";
import { log } from "./logging";

const logger = log("profiles");

/**
 * Register every DB-installed profile into the runtime registry. Each row's
 * `data` is re-validated (it may predate a schema change) and skipped with a log
 * line if invalid — one bad download can never take the whole server down.
 */
async function loadInstalledProfiles(): Promise<void> {
  const rows = await db.select().from(installedProfiles);
  let loaded = 0;
  for (const row of rows) {
    try {
      registerProfile(hydrateProfile(parseProfileData(row.data)));
      loaded++;
    } catch (error) {
      logger.warn('skipping invalid installed profile "{id}": {error}', {
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (loaded > 0) logger.info("loaded {count} installed profile(s)", { count: loaded });
}

/** Active profile id from settings, seeded from env on first boot. */
async function activeProfileId(): Promise<string> {
  const setting = await readSetting(ACTIVE_PROFILE_KEY, activeProfileSchema, {
    id: env.INVERTER_PROFILE,
  });
  return setting.id;
}

let activeProfile: InverterProfile | null = null;

/**
 * Resolve the active profile for this process. Runs the two-phase boot: built-in
 * packages have already self-registered (side-effect imports above), then DB
 * profiles are registered, then the active one is selected. Must be awaited in
 * the server's composition root before routes/manifest/topics are built.
 */
export async function initProfiles(): Promise<InverterProfile> {
  await loadInstalledProfiles();
  activeProfile = getProfile(await activeProfileId());
  return activeProfile;
}

/** The resolved active profile (throws if {@link initProfiles} hasn't run). */
export function getActiveProfile(): InverterProfile {
  if (!activeProfile) throw new Error("profiles not initialized — call initProfiles() at boot");
  return activeProfile;
}

/**
 * Build a live source for a profile + connection config. Whether it's the
 * simulator or a real Modbus source is a deploy-level choice (`INVERTER_SIMULATE`),
 * not part of the saved config.
 */
export function buildSource(profile: InverterProfile, config: InverterConfig): InverterSource {
  return createInverter(profile, {
    simulate: env.INVERTER_SIMULATE,
    connection: {
      host: config.host,
      port: config.port,
      unitId: config.unitId,
      timeoutMs: config.timeoutMs,
      transport: config.transport,
    },
  });
}

/**
 * Everything derived from the active profile, built once at boot and injected
 * into the transports (REST, MQTT) instead of a module-level singleton. Keeps
 * the profile a boot concern while the connection config stays hot-reloadable.
 */
export interface ProfileContext {
  profile: InverterProfile;
  manifest: InverterManifest;
  defByKey: Map<string, MetricDef>;
  metaByKey: Map<string, ManifestMetric>;
  /**
   * Validate a write against the entity's metadata (bounds/enum). Returns an
   * error message, or `null` when the value is acceptable. Shared by the
   * internal command endpoint, the external API, and the MQTT command bridge.
   */
  validateWrite(key: string, value: number): string | null;
}

export function buildProfileContext(profile: InverterProfile): ProfileContext {
  const manifest = buildManifest(profile);
  const defByKey = metricByKey(profile);
  const metaByKey = new Map(manifest.metrics.map((m) => [m.key, m]));

  function validateWrite(key: string, value: number): string | null {
    const def = defByKey.get(key);
    if (!def) return `Unknown entity: ${key}`;
    const c = entityConstraint(def);
    if (!c.writable) return `Entity is not writable: ${key}`;
    if (c.valueType === "enum") {
      return c.enumValues?.includes(value)
        ? null
        : `Value must be one of: ${c.enumValues?.join(", ")}`;
    }
    if (c.min !== undefined && value < c.min) return `Value ${value} is below minimum ${c.min}`;
    if (c.max !== undefined && value > c.max) return `Value ${value} is above maximum ${c.max}`;
    return null;
  }

  return { profile, manifest, defByKey, metaByKey, validateWrite };
}

// fallow-ignore-next-line unused-type
export type { InverterSample };
