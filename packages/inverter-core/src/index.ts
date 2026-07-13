export * from "./types";
export { decode, encodeWord, registerWidth } from "./codec";
export { ModbusInverter, planReads } from "./driver";
export { applyComputed } from "./computed";
export { SimulatedInverter } from "./simulator";
export {
  registerProfile,
  getProfile,
  tryGetProfile,
  listProfiles,
  createInverter,
} from "./registry";
export { resolveKind, deriveCapabilities, toManifestMetric, buildManifest } from "./capabilities";
export { entityConstraint, writableMetrics, metricByKey } from "./entities";
export type { EntityConstraint, EntityValueType } from "./entities";
// Profile authoring SDK + serializable data model + validator.
export { ROLE_CATALOG, ROLE_NAMES } from "./roles";
export type { CanonicalRole, RoleSpec } from "./roles";
export { control, defineFamily, defineProfile, defineVariant, metric, sumOf } from "./define";
export type { MetricAdd, MetricOpts, MetricPatch, MetricsOverlay, ModelOverrides } from "./define";
export { compileComputeExpr, hydrateProfile } from "./profile-data";
export type {
  AggregateExpr,
  AggregateMatch,
  ComputeExpr,
  ControlExpr,
  MetricDataDef,
  ProfileData,
  TopicToKey,
} from "./profile-data";
export { profileDataSchema, parseProfileData, safeParseProfileData } from "./schema";
export { repoIndexSchema, repoProfileEntrySchema } from "./repo-index";
export type { RepoIndex, RepoProfileEntry } from "./repo-index";
