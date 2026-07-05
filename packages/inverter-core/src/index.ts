export * from "./types";
export { decode, encodeWord, registerWidth } from "./codec";
export { ModbusInverter, planReads, applyComputed } from "./driver";
export { SimulatedInverter } from "./simulator";
export { registerProfile, getProfile, listProfiles, createInverter } from "./registry";
export { resolveKind, deriveCapabilities, toManifestMetric, buildManifest } from "./capabilities";
export { entityConstraint, writableMetrics, metricByKey } from "./entities";
export type { EntityConstraint, EntityValueType } from "./entities";
// Profile authoring SDK + serializable data model + validator.
export { ROLE_CATALOG, ROLE_NAMES } from "./roles";
export type { CanonicalRole, RoleSpec } from "./roles";
export { defineProfile, metric } from "./define";
export type { MetricOpts } from "./define";
export { compileComputeExpr, hydrateProfile } from "./profile-data";
export type { ComputeExpr, MetricDataDef, ProfileData } from "./profile-data";
export { profileDataSchema, parseProfileData, safeParseProfileData } from "./schema";
