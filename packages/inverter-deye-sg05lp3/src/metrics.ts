import { control, metric, sumOf } from "@SunReye/inverter-core";
import type { MetricDataDef, ModelOverrides } from "@SunReye/inverter-core";

/**
 * Deye / Sunsynk hybrid holding-register map, transcribed from the vendor
 * Modbus documentation. Deye and Sunsynk single-phase/three-phase hybrids share
 * this register layout, so one profile covers both badges.
 *
 * Authored with the inverter-core SDK: `metric(topic, opts)` derives the
 * canonical `key` from the topic (`/` → `.`) and maps each register onto a
 * {@link CanonicalRole} inline, so the role's required shape (index, enumLabels,
 * writability) is checked at compile time.
 */

const CHARGE_FLOW = { positive: "Discharging", negative: "Charging" } as const;
const GRID_FLOW = { positive: "Importing", negative: "Exporting" } as const;

/** Table 1 — inverter / PV / grid. */
const inverter = [
  metric("inverter/status", {
    label: "Running status",
    group: "inverter",
    addr: 500,
    role: "inverter.status",
    kind: "status",
    enumLabels: { 0: "Standby", 1: "Self-check", 2: "Normal", 3: "Alarm", 4: "Fault" },
  }),
  metric("ac/relay_status", {
    label: "AC relays status",
    group: "inverter",
    addr: 552,
    role: "inverter.relay_status",
    kind: "status",
    enumLabels: { 0: "Open", 1: "Closed" },
  }),
  metric("dc/pv1/power", {
    label: "PV1 Power",
    unit: "W",
    group: "inverter",
    addr: 672,
    role: "pv.string.power",
    index: 1,
  }),
  metric("dc/pv2/power", {
    label: "PV2 Power",
    unit: "W",
    group: "inverter",
    addr: 673,
    role: "pv.string.power",
    index: 2,
  }),
  metric("dc/pv1/voltage", {
    label: "PV1 Voltage",
    unit: "V",
    group: "inverter",
    addr: 676,
    scale: 0.1,
    role: "pv.string.voltage",
    index: 1,
  }),
  metric("dc/pv2/voltage", {
    label: "PV2 Voltage",
    unit: "V",
    group: "inverter",
    addr: 678,
    scale: 0.1,
    role: "pv.string.voltage",
    index: 2,
  }),
  metric("dc/pv1/current", {
    label: "PV1 Current",
    unit: "A",
    group: "inverter",
    addr: 677,
    scale: 0.1,
    role: "pv.string.current",
    index: 1,
  }),
  metric("dc/pv2/current", {
    label: "PV2 Current",
    unit: "A",
    group: "inverter",
    addr: 679,
    scale: 0.1,
    role: "pv.string.current",
    index: 2,
  }),
  metric("day_energy", {
    label: "Daily Production",
    unit: "kWh",
    group: "inverter",
    addr: 529,
    scale: 0.1,
    role: "production.today",
  }),
  metric("total_energy", {
    label: "Total Production",
    unit: "kWh",
    group: "inverter",
    type: "U_DWORD",
    addr: [534, 535],
    scale: 0.1,
    role: "production.total",
  }),
  metric("ac/total_power", {
    label: "Total Grid Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 625,
    role: "grid.power",
    flow: GRID_FLOW,
  }),
  metric("ac/l1/voltage", {
    label: "Grid Voltage L1",
    unit: "V",
    group: "inverter",
    addr: 598,
    scale: 0.1,
    role: "grid.phase.voltage",
    index: 1,
  }),
  metric("ac/l2/voltage", {
    label: "Grid Voltage L2",
    unit: "V",
    group: "inverter",
    addr: 599,
    scale: 0.1,
    role: "grid.phase.voltage",
    index: 2,
  }),
  metric("ac/l3/voltage", {
    label: "Grid Voltage L3",
    unit: "V",
    group: "inverter",
    addr: 600,
    scale: 0.1,
    role: "grid.phase.voltage",
    index: 3,
  }),
  metric("ac/l1/ct/internal", {
    label: "Internal CT L1 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 604,
    role: "grid.phase.power",
    index: 1,
    flow: GRID_FLOW,
  }),
  metric("ac/l2/ct/internal", {
    label: "Internal CT L2 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 605,
    role: "grid.phase.power",
    index: 2,
    flow: GRID_FLOW,
  }),
  metric("ac/l3/ct/internal", {
    label: "Internal CT L3 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 606,
    role: "grid.phase.power",
    index: 3,
    flow: GRID_FLOW,
  }),
  metric("ac/total_internal_power", {
    label: "Total Internal Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 607,
  }),
  metric("ac/l1/ct/external", {
    label: "External CT L1 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 616,
  }),
  metric("ac/l2/ct/external", {
    label: "External CT L2 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 617,
  }),
  metric("ac/l3/ct/external", {
    label: "External CT L3 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 618,
  }),
  metric("ac/daily_energy_bought", {
    label: "Daily Energy Bought",
    unit: "kWh",
    group: "inverter",
    addr: 520,
    scale: 0.1,
    role: "grid.energy.imported.today",
  }),
  metric("ac/total_energy_bought", {
    label: "Total Energy Bought",
    unit: "kWh",
    group: "inverter",
    type: "U_DWORD",
    addr: [522, 523],
    scale: 0.1,
    role: "grid.energy.imported.total",
  }),
  metric("ac/daily_energy_sold", {
    label: "Daily Energy Sold",
    unit: "kWh",
    group: "inverter",
    addr: 521,
    scale: 0.1,
    role: "grid.energy.exported.today",
  }),
  metric("ac/total_energy_sold", {
    label: "Total Energy Sold",
    unit: "kWh",
    group: "inverter",
    type: "U_DWORD",
    addr: [524, 525],
    scale: 0.1,
    role: "grid.energy.exported.total",
  }),
  metric("ac/l1/current", {
    label: "Current L1",
    unit: "A",
    group: "inverter",
    type: "S_WORD",
    addr: 630,
    scale: 0.01,
    role: "grid.phase.current",
    index: 1,
    flow: GRID_FLOW,
  }),
  metric("ac/l2/current", {
    label: "Current L2",
    unit: "A",
    group: "inverter",
    type: "S_WORD",
    addr: 631,
    scale: 0.01,
    role: "grid.phase.current",
    index: 2,
    flow: GRID_FLOW,
  }),
  metric("ac/l3/current", {
    label: "Current L3",
    unit: "A",
    group: "inverter",
    type: "S_WORD",
    addr: 632,
    scale: 0.01,
    role: "grid.phase.current",
    index: 3,
    flow: GRID_FLOW,
  }),
  metric("ac/l1/power", {
    label: "Inverter L1 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 633,
  }),
  metric("ac/l2/power", {
    label: "Inverter L2 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 634,
  }),
  metric("ac/l3/power", {
    label: "Inverter L3 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 635,
  }),
  // Vendor "+1000" temperature encoding: register = °C×10 + 1000, so decode as
  // raw×0.1 − 100. Without the offset these read ~100 °C high (25 → 125).
  metric("radiator_temp", {
    label: "DC Temperature",
    unit: "°C",
    group: "inverter",
    type: "S_WORD",
    addr: 540,
    scale: 0.1,
    offset: -100,
    role: "inverter.temperature.dc",
  }),
  metric("ac/temperature", {
    label: "AC Temperature",
    unit: "°C",
    group: "inverter",
    type: "S_WORD",
    addr: 541,
    scale: 0.1,
    offset: -100,
    role: "inverter.temperature.ac",
  }),
  // Declare intent — "sum every PV-string power" — not a hand-listed key set.
  // Resolved against the final metric set at build time, so a variant that adds
  // or drops a string re-derives the correct total with no per-model patch.
  metric("dc/total_power", {
    label: "DC Total Power",
    unit: "W",
    group: "inverter",
    role: "pv.total.power",
    computeExpr: sumOf({ role: "pv.string.power" }),
  }),
  // Power the inverter consumes for itself (conversion losses + standby draw),
  // from the node balance: everything flowing in minus what reaches the load.
  // Battery and grid fold in with their signed conventions (battery +discharge
  // / −charge, grid +import / −export), so charging and export subtract on their
  // own. Depends on the computed dc.total_power above, so it stays after it.
  metric("inverter/power", {
    label: "Inverter Self-Consumption",
    unit: "W",
    group: "inverter",
    role: "inverter.power",
    computeExpr: {
      combine: {
        add: ["dc.total_power", "battery.power", "ac.total_power"],
        sub: ["ac.ups.total_power"],
      },
    },
  }),
  // Share of the power drawn into the inverter node that actually reaches the
  // load: load ÷ (dc + battery + grid), as a percentage. A zero denominator
  // (night / idle) reads as 0 rather than dividing by zero.
  metric("inverter/efficiency", {
    label: "Inverter Efficiency",
    unit: "%",
    group: "inverter",
    role: "inverter.efficiency",
    kind: "measurement",
    range: { min: 0, max: 100 },
    computeExpr: {
      ratio: {
        num: ["ac.ups.total_power"],
        den: ["dc.total_power", "battery.power", "ac.total_power"],
        scale: 100,
      },
    },
  }),
];

/** Table 2 — battery. */
const battery = [
  metric("battery/daily_charge", {
    label: "Daily Battery Charge",
    unit: "kWh",
    group: "battery",
    addr: 514,
    scale: 0.1,
    role: "battery.energy.charged.today",
  }),
  metric("battery/daily_discharge", {
    label: "Daily Battery Discharge",
    unit: "kWh",
    group: "battery",
    addr: 515,
    scale: 0.1,
    role: "battery.energy.discharged.today",
  }),
  metric("battery/total_charge", {
    label: "Total Battery Charge",
    unit: "kWh",
    group: "battery",
    type: "U_DWORD",
    addr: [516, 517],
    scale: 0.1,
    role: "battery.energy.charged.total",
  }),
  metric("battery/total_discharge", {
    label: "Total Battery Discharge",
    unit: "kWh",
    group: "battery",
    type: "U_DWORD",
    addr: [518, 519],
    scale: 0.1,
    role: "battery.energy.discharged.total",
  }),
  // Aggregate pack power across both BMS banks — verified to read the full pack
  // (~745 W = battery.voltage × total current), not a single bank's share. So it
  // stays the canonical total; only current is reported per-bank (see below).
  metric("battery/power", {
    label: "Battery Power",
    unit: "W",
    group: "battery",
    type: "S_WORD",
    addr: 590,
    role: "battery.power",
    flow: CHARGE_FLOW,
  }),
  metric("battery/voltage", {
    label: "Battery Voltage",
    unit: "V",
    group: "battery",
    addr: 587,
    scale: 0.01,
    role: "battery.voltage",
  }),
  metric("battery/soc", {
    label: "Battery SOC",
    unit: "%",
    group: "battery",
    addr: 588,
    role: "battery.soc",
    range: { min: 0, max: 100 },
  }),
  // Dual-BMS pack: current is sensed per bank (591 / 594) while power (590) is
  // already the aggregate. Each bank register reads ~half the true current, so
  // the canonical Battery Current sums them (verified: 7.73 + 8.13 = 15.86 A,
  // matching 829 W ÷ voltage). Sign flows from each bank (CHARGE_FLOW: +
  // discharging). Only current is split out — the bank-2 voltage/SOC/power/temp
  // registers (589/593/595/596) read 0 on this model, so voltage, SOC, power and
  // temperature stay pack-level (the canonical metrics above).
  metric("battery/1/current", {
    label: "Battery 1 Current",
    unit: "A",
    group: "battery",
    type: "S_WORD",
    addr: 591,
    scale: 0.01,
    flow: CHARGE_FLOW,
  }),
  metric("battery/2/current", {
    label: "Battery 2 Current",
    unit: "A",
    group: "battery",
    type: "S_WORD",
    addr: 594,
    scale: 0.01,
    flow: CHARGE_FLOW,
  }),
  metric("battery/current", {
    label: "Battery Current",
    unit: "A",
    group: "battery",
    role: "battery.current",
    flow: CHARGE_FLOW,
    computeExpr: { sum: ["battery.1.current", "battery.2.current"] },
  }),
  metric("battery/temperature", {
    label: "Battery Temperature",
    unit: "°C",
    group: "battery",
    addr: 586,
    scale: 0.1,
    offset: -100,
    role: "battery.temperature",
  }),
  // Battery Charging Type Control Mode (read-only for now). Decides whether the
  // time-of-use schedule is honored via target voltage (lead-acid, four-stage)
  // or target SOC (lithium BMS), so the TOU editor shows only the matching field.
  metric("battery/mode", {
    label: "Battery Mode",
    group: "battery",
    addr: 98,
    role: "battery.mode",
    kind: "status",
    enumLabels: { 0: "Lead-acid (voltage)", 1: "Lithium (SOC)" },
  }),
];

/** Table 3 — generator input ports. */
const generator = [
  metric("ac/generator/a/voltage", {
    label: "Gen port A Voltage",
    unit: "V",
    group: "generator",
    addr: 661,
    scale: 0.1,
    role: "generator.phase.voltage",
    index: 1,
  }),
  metric("ac/generator/b/voltage", {
    label: "Gen port B Voltage",
    unit: "V",
    group: "generator",
    addr: 662,
    scale: 0.1,
    role: "generator.phase.voltage",
    index: 2,
  }),
  metric("ac/generator/c/voltage", {
    label: "Gen port C Voltage",
    unit: "V",
    group: "generator",
    addr: 663,
    scale: 0.1,
    role: "generator.phase.voltage",
    index: 3,
  }),
  metric("ac/generator/a/power", {
    label: "Gen port A Power",
    unit: "W",
    group: "generator",
    addr: 664,
    role: "generator.phase.power",
    index: 1,
  }),
  metric("ac/generator/b/power", {
    label: "Gen port B Power",
    unit: "W",
    group: "generator",
    addr: 665,
    role: "generator.phase.power",
    index: 2,
  }),
  metric("ac/generator/c/power", {
    label: "Gen port C Power",
    unit: "W",
    group: "generator",
    addr: 666,
    role: "generator.phase.power",
    index: 3,
  }),
  metric("ac/generator/total_power", {
    label: "Total Power of Gen Ports",
    unit: "W",
    group: "generator",
    addr: 667,
    role: "generator.power",
  }),
  metric("ac/generator/daily_energy", {
    label: "Daily Generator Production",
    unit: "kWh",
    group: "generator",
    addr: 536,
    scale: 0.1,
    role: "generator.energy.today",
  }),
];

/** Table 4 — writable settings. */
const settings = [
  metric("settings/battery/maximum_charge_current", {
    label: "Max battery charge current",
    unit: "A",
    group: "settings",
    addr: 108,
    access: "rw",
    role: "setting.battery.max_charge_current",
    // Generic family envelope (largest SKU); individual SKUs tighten it in `models`.
    range: { min: 0, max: 350 },
  }),
  metric("settings/battery/maximum_discharge_current", {
    label: "Max battery discharge current",
    unit: "A",
    group: "settings",
    addr: 109,
    access: "rw",
    role: "setting.battery.max_discharge_current",
    range: { min: 0, max: 350 },
  }),
  metric("settings/battery/maximum_grid_charge_current", {
    label: "Max battery grid-charge current",
    unit: "A",
    group: "settings",
    addr: 128,
    access: "rw",
    role: "setting.battery.max_grid_charge_current",
  }),
  metric("settings/battery/grid_charge", {
    label: "Grid Charge enabled",
    group: "settings",
    addr: 130,
    access: "rw",
    role: "setting.battery.grid_charge",
    enumLabels: { 0: "Off", 1: "On" },
  }),
  metric("settings/workmode", {
    label: "Work Mode",
    group: "settings",
    addr: 142,
    access: "rw",
    role: "setting.work_mode",
    enumLabels: { 0: "Selling First", 1: "Zero Export to Load", 2: "Zero Export to CT" },
  }),
  metric("settings/solar_sell_max_power", {
    label: "Max Solar Sell Power",
    unit: "W",
    group: "settings",
    addr: 143,
    access: "rw",
    role: "setting.solar_sell.max_power",
  }),
  metric("settings/solar_sell", {
    label: "Solar sell enabled",
    group: "settings",
    addr: 145,
    access: "rw",
    role: "setting.solar_sell.enabled",
    enumLabels: { 0: "Off", 1: "On" },
  }),
];

/** Table 5 — system. Packed date/time across three registers (opaque). */
const system = [
  metric("settings/system_time", {
    label: "System time",
    group: "system",
    type: "RAW",
    addr: [62, 63, 64],
  }),
];

/** Table 6 — time-of-use schedule (writable). */
const timeOfUse: MetricDataDef[] = [
  metric("timeofuse/selling", {
    label: "TOU Weekly Selling Schedule",
    group: "timeofuse",
    addr: 146,
    access: "rw",
  }),
  ...[148, 149, 150, 151, 152, 153].map((addr, i) =>
    metric(`timeofuse/time/${i + 1}`, {
      label: `TOU Time ${i + 1}`,
      group: "timeofuse",
      addr,
      access: "rw",
    }),
  ),
  ...[154, 155, 156, 157, 158, 159].map((addr, i) =>
    metric(`timeofuse/power/${i + 1}`, {
      label: `TOU Power ${i + 1}`,
      unit: "W",
      group: "timeofuse",
      addr,
      access: "rw",
    }),
  ),
  ...[160, 161, 162, 163, 164, 165].map((addr, i) =>
    metric(`timeofuse/voltage/${i + 1}`, {
      label: `TOU Voltage ${i + 1}`,
      unit: "V",
      group: "timeofuse",
      addr,
      scale: 0.01,
      access: "rw",
    }),
  ),
  ...[166, 167, 168, 169, 170, 171].map((addr, i) =>
    metric(`timeofuse/soc/${i + 1}`, {
      label: `TOU SOC ${i + 1}`,
      unit: "%",
      group: "timeofuse",
      addr,
      access: "rw",
    }),
  ),
  ...[172, 173, 174, 175, 176, 177].map((addr, i) =>
    metric(`timeofuse/enabled/${i + 1}`, {
      label: `TOU Charge Enable ${i + 1}`,
      group: "timeofuse",
      addr,
      access: "rw",
    }),
  ),
];

/** Table 7 — backup / UPS load output. */
const load = [
  metric("ac/ups/total_power", {
    label: "Total Load Power",
    unit: "W",
    group: "load",
    addr: 653,
    role: "load.power",
  }),
  metric("ac/ups/l1/power", {
    label: "Load L1 Power",
    unit: "W",
    group: "load",
    addr: 650,
    role: "load.phase.power",
    index: 1,
  }),
  metric("ac/ups/l2/power", {
    label: "Load L2 Power",
    unit: "W",
    group: "load",
    addr: 651,
    role: "load.phase.power",
    index: 2,
  }),
  metric("ac/ups/l3/power", {
    label: "Load L3 Power",
    unit: "W",
    group: "load",
    addr: 652,
    role: "load.phase.power",
    index: 3,
  }),
  metric("ac/ups/l1/voltage", {
    label: "Load Voltage L1",
    unit: "V",
    group: "load",
    addr: 644,
    scale: 0.1,
    role: "load.phase.voltage",
    index: 1,
  }),
  metric("ac/ups/l2/voltage", {
    label: "Load Voltage L2",
    unit: "V",
    group: "load",
    addr: 645,
    scale: 0.1,
    role: "load.phase.voltage",
    index: 2,
  }),
  metric("ac/ups/l3/voltage", {
    label: "Load Voltage L3",
    unit: "V",
    group: "load",
    addr: 646,
    scale: 0.1,
    role: "load.phase.voltage",
    index: 3,
  }),
  metric("ac/ups/daily_energy", {
    label: "Daily Load Consumption",
    unit: "kWh",
    group: "load",
    addr: 526,
    scale: 0.1,
    role: "load.energy.today",
  }),
  metric("ac/ups/total_energy", {
    label: "Total Load Consumption",
    unit: "kWh",
    group: "load",
    type: "U_DWORD",
    addr: [527, 528],
    scale: 0.1,
    role: "load.energy.total",
  }),
];

/**
 * Union of every statically-keyed register key, e.g.
 * `"settings.battery.maximum_discharge_current"`. Each `metric()` returns a
 * literal `key` type (see `TopicToKey`), so this is the exact set of real keys —
 * what gives composite-control `target`s IDE autocomplete and compile checks.
 * The time-of-use table is excluded on purpose: it builds keys from dynamic
 * template literals (`timeofuse/time/${i}`), so its key type is `string` and
 * would collapse the union.
 */
type DeyeKey =
  | (typeof inverter)[number]["key"]
  | (typeof battery)[number]["key"]
  | (typeof generator)[number]["key"]
  | (typeof settings)[number]["key"]
  | (typeof system)[number]["key"]
  | (typeof load)[number]["key"];

/**
 * SG05LP3-EU-SM2 three-phase hybrid SKUs, keyed by profile id. They share the
 * whole register map above and differ only in the battery charge/discharge
 * current ceiling (equal per model), from the vendor datasheet. Typed against
 * {@link DeyeKey} so the overlay keys autocomplete and a typo won't compile.
 */
export const models: Record<string, ModelOverrides<DeyeKey>> = {
  "deye-sun14k-sg05lp3": {
    name: "SUN-14K-SG05LP3-EU-SM2",
    metrics: {
      "settings.battery.maximum_charge_current": { max: 260 },
      "settings.battery.maximum_discharge_current": { max: 260 },
    },
  },
  "deye-sun15k-sg05lp3": {
    name: "SUN-15K-SG05LP3-EU-SM2",
    metrics: {
      "settings.battery.maximum_charge_current": { max: 280 },
      "settings.battery.maximum_discharge_current": { max: 280 },
    },
  },
  "deye-sun16k-sg05lp3": {
    name: "SUN-16K-SG05LP3-EU-SM2",
    metrics: {
      "settings.battery.maximum_charge_current": { max: 300 },
      "settings.battery.maximum_discharge_current": { max: 300 },
    },
  },
  "deye-sun18k-sg05lp3": {
    name: "SUN-18K-SG05LP3-EU-SM2",
    metrics: {
      "settings.battery.maximum_charge_current": { max: 330 },
      "settings.battery.maximum_discharge_current": { max: 330 },
    },
  },
  "deye-sun20k-sg05lp3": {
    name: "SUN-20K-SG05LP3-EU-SM2",
    metrics: {
      "settings.battery.maximum_charge_current": { max: 350 },
      "settings.battery.maximum_discharge_current": { max: 350 },
    },
  },
};

/**
 * Table 8 — composite controls (no registers of their own). Battery discharge
 * lock: on, snapshot the max-discharge-current limit and force it to 0; off,
 * restore the captured limit. `control<DeyeKey>` autocompletes + compile-checks
 * the `target`.
 */
const controls: MetricDataDef[] = [
  control<DeyeKey>("settings/battery/lock", {
    label: "Battery discharge lock",
    group: "settings",
    enumLabels: { 0: "Unlocked", 1: "Locked" },
    controlExpr: {
      snapshotToggle: {
        target: "settings.battery.maximum_discharge_current",
        lockedValue: 0,
      },
    },
  }),
];

/** The full Deye / Sunsynk register + semantic map (controls appended last). */
export const metrics: MetricDataDef[] = [
  ...inverter,
  ...battery,
  ...generator,
  ...settings,
  ...system,
  ...timeOfUse,
  ...load,
  ...controls,
];
