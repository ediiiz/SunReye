/**
 * Compat layer types shared by every inverter profile.
 *
 * A profile is a data-only description of an inverter's Modbus map plus an
 * optional simulation hook. Profiles ship as their own packages
 * (e.g. `@ReyeON/inverter-deye-sunsynk`) and register themselves into the
 * runtime registry, so new inverters can be "downloaded" without touching
 * the core engine.
 */

/**
 * Modbus register encodings we support.
 *
 * - `U_WORD`   unsigned 16-bit, one register.
 * - `S_WORD`   signed 16-bit (two's complement), one register.
 * - `U_DWORD`  unsigned 32-bit across two registers, low word first
 *              (`addresses = [low, high]`), matching the "U_DWORD (LW,HW)"
 *              layout in the vendor docs.
 * - `RAW`      opaque multi-register value (e.g. packed system time). Not
 *              part of the numeric sample; carried in the catalog only.
 */
export type RegisterType = "U_WORD" | "S_WORD" | "U_DWORD" | "RAW";

/** Read-only vs. read/write (settings) register. */
export type MetricAccess = "r" | "rw";

/** One decoded/normalized value keyed by its canonical metric key. */
export type MetricValues = Record<string, number>;

/**
 * How a metric should be *treated* by consumers (drives widget choice in the
 * UI), independent of any specific inverter.
 *
 * - `measurement`  instantaneous scalar (power, voltage, current, SoC, temp).
 * - `cumulative`   monotonic energy counter (kWh) — show today/total + deltas.
 * - `status`       enum / flag; render a label from {@link MetricDef.enumLabels}.
 * - `setting`      writable configuration; render a control.
 */
export type MetricKind = "measurement" | "cumulative" | "status" | "setting";

/**
 * Canonical, inverter-agnostic concept a metric represents. This is the stable
 * vocabulary the UI renders against; adapters map device-specific metrics onto
 * these roles so the UI never hard-codes vendor keys. Indexed concepts
 * (strings, phases) carry the position in {@link MetricDef.index}.
 */
export type CanonicalRole =
  // Solar
  | "pv.string.power"
  | "pv.string.voltage"
  | "pv.string.current"
  | "pv.total.power"
  | "production.today"
  | "production.total"
  // Battery
  | "battery.soc"
  | "battery.power"
  | "battery.voltage"
  | "battery.current"
  | "battery.temperature"
  | "battery.energy.charged.today"
  | "battery.energy.charged.total"
  | "battery.energy.discharged.today"
  | "battery.energy.discharged.total"
  // Grid
  | "grid.power"
  | "grid.phase.voltage"
  | "grid.phase.current"
  | "grid.phase.power"
  | "grid.energy.imported.today"
  | "grid.energy.imported.total"
  | "grid.energy.exported.today"
  | "grid.energy.exported.total"
  // Backup / load
  | "load.power"
  | "load.phase.power"
  | "load.phase.voltage"
  | "load.energy.today"
  | "load.energy.total"
  // Generator
  | "generator.power"
  | "generator.phase.power"
  | "generator.phase.voltage"
  | "generator.energy.today"
  // Inverter
  | "inverter.status"
  | "inverter.relay_status"
  | "inverter.temperature.dc"
  | "inverter.temperature.ac"
  // Settings / controls
  | "setting.battery.max_charge_current"
  | "setting.battery.max_discharge_current"
  | "setting.battery.max_grid_charge_current"
  | "setting.battery.grid_charge"
  | "setting.work_mode"
  | "setting.solar_sell.max_power"
  | "setting.solar_sell.enabled";

/** Expected value bounds for gauge-style widgets. */
export interface MetricRange {
  min: number;
  max: number;
}

/** Human labels for a signed metric's direction (e.g. battery charge/discharge). */
export interface MetricFlow {
  /** Meaning when value > 0. */
  positive: string;
  /** Meaning when value < 0. */
  negative: string;
}

export interface MetricDef {
  /** Canonical key, dotted form of the MQTT topic, e.g. `dc.pv1.power`. */
  key: string;
  /** MQTT topic suffix from the vendor docs, e.g. `dc/pv1/power`. */
  topic: string;
  /** Human label. */
  label: string;
  /** Physical unit, or `null` for status/enum values. */
  unit: string | null;
  /** Logical grouping (inverter, battery, generator, settings, ...). */
  group: string;
  type: RegisterType;
  /**
   * Modbus holding-register address(es), decimal. Length matches `type`:
   * 1 for `U_WORD`/`S_WORD`, 2 (`[low, high]`) for `U_DWORD`, N for `RAW`.
   * Empty for computed metrics (never read from the wire).
   */
  addresses: number[];
  /** Multiply the raw integer by this to get engineering units. */
  scale: number;
  access: MetricAccess;
  /**
   * Derived metric — computed from other decoded values instead of read from
   * Modbus. Applied both on real reads and in simulation.
   */
  compute?: (values: MetricValues) => number;

  // --- Semantic / render metadata (the UI contract) ---
  /** Canonical concept, if this metric maps to one. */
  role?: CanonicalRole;
  /** Position for indexed roles (PV string, grid/load phase). 1-based. */
  index?: number;
  /** Overrides the kind inferred from `access`/`unit`. */
  kind?: MetricKind;
  /** Expected bounds for gauges. */
  range?: MetricRange;
  /** Enum → label map for `status` metrics. */
  enumLabels?: Record<number, string>;
  /** Direction labels for signed measurements. */
  flow?: MetricFlow;
}

/** Persistent, profile-owned simulation state (SoC, energy counters, ...). */
export type SimState = Record<string, number>;

export interface SimContext {
  /** Wall-clock time of this sample. */
  now: Date;
  /** Seconds elapsed since the previous sample (0 on the first sample). */
  dtSec: number;
  /** Mutable state the profile may read and update across samples. */
  state: SimState;
}

/**
 * Profile-specific coherent simulation. Returns partial `MetricValues`; any
 * metric it omits is filled by the generic fallback. Computed metrics run
 * afterwards regardless.
 */
export type SimulateFn = (ctx: SimContext) => MetricValues;

export interface InverterProfile {
  /** Stable slug used to select the profile at runtime, e.g. `deye-sunsynk`. */
  id: string;
  name: string;
  manufacturer: string;
  metrics: MetricDef[];
  /** Optional coherent simulator; falls back to generic synthesis if absent. */
  simulate?: SimulateFn;
}

/** Which optional subsystems a specific inverter exposes. */
export type InverterFeature = "solar_sell" | "time_of_use" | "grid_charge";

/**
 * What the inverter can do — derived from the roles/groups present in its
 * profile (plus explicit declarations). The UI switches whole sections on/off
 * from this instead of probing individual metric keys.
 */
export interface InverterCapabilities {
  battery: boolean;
  /** Number of PV (MPPT) strings, from distinct `pv.string.*` indices. */
  pvStrings: number;
  /** 1 or 3, from distinct `grid.phase.voltage` indices. */
  phases: number;
  grid: boolean;
  generator: boolean;
  /** Backup / UPS load output present. */
  backupLoad: boolean;
  features: InverterFeature[];
  /** Keys of writable metrics the UI may expose as controls. */
  controls: string[];
}

/** Serialized, render-ready view of a metric (no functions, no addresses). */
export interface ManifestMetric {
  key: string;
  label: string;
  unit: string | null;
  group: string;
  kind: MetricKind;
  writable: boolean;
  role?: CanonicalRole;
  index?: number;
  range?: MetricRange;
  enumLabels?: Record<number, string>;
  flow?: MetricFlow;
}

/**
 * The full contract sent to clients: identity + capabilities + render-ready
 * metric catalog. A UI can build itself entirely from this.
 */
export interface InverterManifest {
  id: string;
  name: string;
  manufacturer: string;
  capabilities: InverterCapabilities;
  metrics: ManifestMetric[];
}

export interface InverterConnection {
  host: string;
  port: number;
  unitId: number;
  /** Per-request Modbus timeout, ms. */
  timeoutMs?: number;
}

/** One timestamped reading of every numeric metric in a profile. */
export interface InverterSample {
  time: string;
  inverterId: string;
  metrics: MetricValues;
}

/** A transport (real Modbus or simulator) exposing the same read/write shape. */
export interface InverterSource {
  readonly profile: InverterProfile;
  read(): Promise<InverterSample>;
  /** Write a `rw` metric in engineering units. */
  write(key: string, value: number): Promise<void>;
  close(): Promise<void>;
}
