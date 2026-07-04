/**
 * Transport-neutral entity descriptors, derived from profile metadata.
 *
 * The profile's {@link MetricDef} list is the single source of truth for every
 * "entity" the inverter exposes. Integration transports (the REST API, the MQTT
 * bridge) generate their surface from these helpers instead of hand-listing
 * routes/topics. Everything here is plain data — no HTTP/MQTT framework types —
 * so a transport maps it onto its own validation (TypeBox, JSON schema, ...).
 */

import type { InverterProfile, MetricDef } from "./types";

/** How an entity's accepted value is shaped, for validation and docs. */
export type EntityValueType = "number" | "enum";

/**
 * What an entity accepts, derived from its metadata. Bounds/enum come straight
 * from the profile ({@link MetricDef.range}, {@link MetricDef.enumLabels}); when
 * the profile doesn't declare them the value is an unbounded number — annotating
 * the profile tightens validation everywhere at once.
 */
export interface EntityConstraint {
  /** Accepts writes: read/write access and a single numeric register. */
  writable: boolean;
  valueType: EntityValueType;
  /** Inclusive bounds for a `number` value, when the profile declares a range. */
  min?: number;
  max?: number;
  /** Permitted raw values for an `enum`, from `enumLabels` keys. */
  enumValues?: number[];
}

/**
 * RAW registers (e.g. packed system time) carry no single numeric value, so
 * they're never writable through the numeric entity API and validate as `number`
 * only nominally (they won't appear in numeric samples).
 */
export function entityConstraint(def: MetricDef): EntityConstraint {
  const writable = def.access === "rw" && def.type !== "RAW";
  if (def.enumLabels) {
    return {
      writable,
      valueType: "enum",
      enumValues: Object.keys(def.enumLabels).map(Number),
    };
  }
  return { writable, valueType: "number", min: def.range?.min, max: def.range?.max };
}

/** Writable entities: the profile metrics that accept a numeric command. */
export function writableMetrics(profile: InverterProfile): MetricDef[] {
  return profile.metrics.filter((m) => entityConstraint(m).writable);
}

/** Index profile metrics by their canonical key for O(1) lookup. */
export function metricByKey(profile: InverterProfile): Map<string, MetricDef> {
  return new Map(profile.metrics.map((m) => [m.key, m]));
}
