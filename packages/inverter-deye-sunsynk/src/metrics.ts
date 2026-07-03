import type { MetricAccess, MetricDef, MetricValues, RegisterType } from "@ReyeON/inverter-core";

/**
 * Deye / Sunsynk hybrid holding-register map, transcribed from the vendor
 * Modbus documentation. Deye and Sunsynk single-phase/three-phase hybrids share
 * this register layout, so one profile covers both badges.
 *
 * The canonical `key` is the MQTT topic suffix with `/` → `.`.
 */
interface Spec {
  topic: string;
  label: string;
  unit?: string | null;
  group: string;
  type?: RegisterType;
  /** Single address, or `[low, high]` for U_DWORD / N words for RAW. */
  addr: number | number[];
  scale?: number;
  access?: MetricAccess;
  compute?: (values: MetricValues) => number;
}

function def(s: Spec): MetricDef {
  return {
    key: s.topic.replaceAll("/", "."),
    topic: s.topic,
    label: s.label,
    unit: s.unit ?? null,
    group: s.group,
    type: s.type ?? "U_WORD",
    addresses: s.addr === undefined ? [] : Array.isArray(s.addr) ? s.addr : [s.addr],
    scale: s.scale ?? 1,
    access: s.access ?? "r",
    compute: s.compute,
  };
}

/** Table 1 — inverter / PV / grid. */
const inverter: MetricDef[] = [
  def({ topic: "inverter/status", label: "Running status", group: "inverter", addr: 500 }),
  def({ topic: "ac/relay_status", label: "AC relays status", group: "inverter", addr: 552 }),
  def({ topic: "dc/pv1/power", label: "PV1 Power", unit: "W", group: "inverter", addr: 672 }),
  def({ topic: "dc/pv2/power", label: "PV2 Power", unit: "W", group: "inverter", addr: 673 }),
  def({
    topic: "dc/pv1/voltage",
    label: "PV1 Voltage",
    unit: "V",
    group: "inverter",
    addr: 676,
    scale: 0.1,
  }),
  def({
    topic: "dc/pv2/voltage",
    label: "PV2 Voltage",
    unit: "V",
    group: "inverter",
    addr: 678,
    scale: 0.1,
  }),
  def({
    topic: "dc/pv1/current",
    label: "PV1 Current",
    unit: "A",
    group: "inverter",
    addr: 677,
    scale: 0.1,
  }),
  def({
    topic: "dc/pv2/current",
    label: "PV2 Current",
    unit: "A",
    group: "inverter",
    addr: 679,
    scale: 0.1,
  }),
  def({
    topic: "day_energy",
    label: "Daily Production",
    unit: "kWh",
    group: "inverter",
    addr: 529,
    scale: 0.1,
  }),
  def({
    topic: "total_energy",
    label: "Total Production",
    unit: "kWh",
    group: "inverter",
    type: "U_DWORD",
    addr: [534, 535],
    scale: 0.1,
  }),
  def({
    topic: "ac/total_power",
    label: "Total Grid Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 625,
  }),
  def({
    topic: "ac/l1/voltage",
    label: "Grid Voltage L1",
    unit: "V",
    group: "inverter",
    addr: 598,
    scale: 0.1,
  }),
  def({
    topic: "ac/l2/voltage",
    label: "Grid Voltage L2",
    unit: "V",
    group: "inverter",
    addr: 599,
    scale: 0.1,
  }),
  def({
    topic: "ac/l3/voltage",
    label: "Grid Voltage L3",
    unit: "V",
    group: "inverter",
    addr: 600,
    scale: 0.1,
  }),
  def({
    topic: "ac/l1/ct/internal",
    label: "Internal CT L1 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 604,
  }),
  def({
    topic: "ac/l2/ct/internal",
    label: "Internal CT L2 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 605,
  }),
  def({
    topic: "ac/l3/ct/internal",
    label: "Internal CT L3 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 606,
  }),
  def({
    topic: "ac/total_internal_power",
    label: "Total Internal Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 607,
  }),
  def({
    topic: "ac/l1/ct/external",
    label: "External CT L1 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 616,
  }),
  def({
    topic: "ac/l2/ct/external",
    label: "External CT L2 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 617,
  }),
  def({
    topic: "ac/l3/ct/external",
    label: "External CT L3 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 618,
  }),
  def({
    topic: "ac/daily_energy_bought",
    label: "Daily Energy Bought",
    unit: "kWh",
    group: "inverter",
    addr: 520,
    scale: 0.1,
  }),
  def({
    topic: "ac/total_energy_bought",
    label: "Total Energy Bought",
    unit: "kWh",
    group: "inverter",
    type: "U_DWORD",
    addr: [522, 523],
    scale: 0.1,
  }),
  def({
    topic: "ac/daily_energy_sold",
    label: "Daily Energy Sold",
    unit: "kWh",
    group: "inverter",
    addr: 521,
    scale: 0.1,
  }),
  def({
    topic: "ac/total_energy_sold",
    label: "Total Energy Sold",
    unit: "kWh",
    group: "inverter",
    type: "U_DWORD",
    addr: [524, 525],
    scale: 0.1,
  }),
  def({
    topic: "ac/l1/current",
    label: "Current L1",
    unit: "A",
    group: "inverter",
    type: "S_WORD",
    addr: 630,
    scale: 0.01,
  }),
  def({
    topic: "ac/l2/current",
    label: "Current L2",
    unit: "A",
    group: "inverter",
    type: "S_WORD",
    addr: 631,
    scale: 0.01,
  }),
  def({
    topic: "ac/l3/current",
    label: "Current L3",
    unit: "A",
    group: "inverter",
    type: "S_WORD",
    addr: 632,
    scale: 0.01,
  }),
  def({
    topic: "ac/l1/power",
    label: "Inverter L1 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 633,
  }),
  def({
    topic: "ac/l2/power",
    label: "Inverter L2 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 634,
  }),
  def({
    topic: "ac/l3/power",
    label: "Inverter L3 Power",
    unit: "W",
    group: "inverter",
    type: "S_WORD",
    addr: 635,
  }),
  def({
    topic: "radiator_temp",
    label: "DC Temperature",
    unit: "°C",
    group: "inverter",
    type: "S_WORD",
    addr: 540,
    scale: 0.1,
  }),
  def({
    topic: "ac/temperature",
    label: "AC Temperature",
    unit: "°C",
    group: "inverter",
    type: "S_WORD",
    addr: 541,
    scale: 0.1,
  }),
  def({
    topic: "dc/total_power",
    label: "DC Total Power",
    unit: "W",
    group: "inverter",
    addr: [],
    compute: (v) => (v["dc.pv1.power"] ?? 0) + (v["dc.pv2.power"] ?? 0),
  }),
];

/** Table 2 — battery. */
const battery: MetricDef[] = [
  def({
    topic: "battery/daily_charge",
    label: "Daily Battery Charge",
    unit: "kWh",
    group: "battery",
    addr: 514,
    scale: 0.1,
  }),
  def({
    topic: "battery/daily_discharge",
    label: "Daily Battery Discharge",
    unit: "kWh",
    group: "battery",
    addr: 515,
    scale: 0.1,
  }),
  def({
    topic: "battery/total_charge",
    label: "Total Battery Charge",
    unit: "kWh",
    group: "battery",
    type: "U_DWORD",
    addr: [516, 517],
    scale: 0.1,
  }),
  def({
    topic: "battery/total_discharge",
    label: "Total Battery Discharge",
    unit: "kWh",
    group: "battery",
    type: "U_DWORD",
    addr: [518, 519],
    scale: 0.1,
  }),
  def({
    topic: "battery/power",
    label: "Battery Power",
    unit: "W",
    group: "battery",
    type: "S_WORD",
    addr: 590,
  }),
  def({
    topic: "battery/voltage",
    label: "Battery Voltage",
    unit: "V",
    group: "battery",
    addr: 587,
    scale: 0.01,
  }),
  def({ topic: "battery/soc", label: "Battery SOC", unit: "%", group: "battery", addr: 588 }),
  def({
    topic: "battery/current",
    label: "Battery Current",
    unit: "A",
    group: "battery",
    type: "S_WORD",
    addr: 591,
    scale: 0.01,
  }),
  def({
    topic: "battery/temperature",
    label: "Battery Temperature",
    unit: "°C",
    group: "battery",
    addr: 586,
    scale: 0.1,
  }),
];

/** Table 3 — generator input ports. */
const generator: MetricDef[] = [
  def({
    topic: "ac/generator/a/voltage",
    label: "Gen port A Voltage",
    unit: "V",
    group: "generator",
    addr: 661,
    scale: 0.1,
  }),
  def({
    topic: "ac/generator/b/voltage",
    label: "Gen port B Voltage",
    unit: "V",
    group: "generator",
    addr: 662,
    scale: 0.1,
  }),
  def({
    topic: "ac/generator/c/voltage",
    label: "Gen port C Voltage",
    unit: "V",
    group: "generator",
    addr: 663,
    scale: 0.1,
  }),
  def({
    topic: "ac/generator/a/power",
    label: "Gen port A Power",
    unit: "W",
    group: "generator",
    addr: 664,
  }),
  def({
    topic: "ac/generator/b/power",
    label: "Gen port B Power",
    unit: "W",
    group: "generator",
    addr: 665,
  }),
  def({
    topic: "ac/generator/c/power",
    label: "Gen port C Power",
    unit: "W",
    group: "generator",
    addr: 666,
  }),
  def({
    topic: "ac/generator/total_power",
    label: "Total Power of Gen Ports",
    unit: "W",
    group: "generator",
    addr: 667,
  }),
  def({
    topic: "ac/generator/daily_energy",
    label: "Daily Generator Production",
    unit: "kWh",
    group: "generator",
    addr: 536,
    scale: 0.1,
  }),
];

/** Table 4 — writable settings. */
const settings: MetricDef[] = [
  def({
    topic: "settings/battery/maximum_charge_current",
    label: "Max battery charge current",
    unit: "A",
    group: "settings",
    addr: 108,
    access: "rw",
  }),
  def({
    topic: "settings/battery/maximum_discharge_current",
    label: "Max battery discharge current",
    unit: "A",
    group: "settings",
    addr: 109,
    access: "rw",
  }),
  def({
    topic: "settings/battery/maximum_grid_charge_current",
    label: "Max battery grid-charge current",
    unit: "A",
    group: "settings",
    addr: 128,
    access: "rw",
  }),
  def({
    topic: "settings/battery/grid_charge",
    label: "Grid Charge enabled",
    group: "settings",
    addr: 130,
    access: "rw",
  }),
  def({
    topic: "settings/workmode",
    label: "Work Mode",
    group: "settings",
    addr: 142,
    access: "rw",
  }),
  def({
    topic: "settings/solar_sell_max_power",
    label: "Max Solar Sell Power",
    unit: "W",
    group: "settings",
    addr: 143,
    access: "rw",
  }),
  def({
    topic: "settings/solar_sell",
    label: "Solar sell enabled",
    group: "settings",
    addr: 145,
    access: "rw",
  }),
];

/** Table 5 — system. Packed date/time across three registers (opaque). */
const system: MetricDef[] = [
  def({
    topic: "settings/system_time",
    label: "System time",
    group: "system",
    type: "RAW",
    addr: [62, 63, 64],
  }),
];

/** Table 6 — time-of-use schedule (writable). */
const timeOfUse: MetricDef[] = [
  def({
    topic: "timeofuse/selling",
    label: "TOU Weekly Selling Schedule",
    group: "timeofuse",
    addr: 146,
    access: "rw",
  }),
  ...[148, 149, 150, 151, 152, 153].map((addr, i) =>
    def({
      topic: `timeofuse/time/${i + 1}`,
      label: `TOU Time ${i + 1}`,
      group: "timeofuse",
      addr,
      access: "rw",
    }),
  ),
  ...[154, 155, 156, 157, 158, 159].map((addr, i) =>
    def({
      topic: `timeofuse/power/${i + 1}`,
      label: `TOU Power ${i + 1}`,
      unit: "W",
      group: "timeofuse",
      addr,
      access: "rw",
    }),
  ),
  ...[160, 161, 162, 163, 164, 165].map((addr, i) =>
    def({
      topic: `timeofuse/voltage/${i + 1}`,
      label: `TOU Voltage ${i + 1}`,
      unit: "V",
      group: "timeofuse",
      addr,
      scale: 0.01,
      access: "rw",
    }),
  ),
  ...[166, 167, 168, 169, 170, 171].map((addr, i) =>
    def({
      topic: `timeofuse/soc/${i + 1}`,
      label: `TOU SOC ${i + 1}`,
      unit: "%",
      group: "timeofuse",
      addr,
      access: "rw",
    }),
  ),
  ...[172, 173, 174, 175, 176, 177].map((addr, i) =>
    def({
      topic: `timeofuse/enabled/${i + 1}`,
      label: `TOU Charge Enable ${i + 1}`,
      group: "timeofuse",
      addr,
      access: "rw",
    }),
  ),
];

/** Table 7 — backup / UPS load output. */
const load: MetricDef[] = [
  def({
    topic: "ac/ups/total_power",
    label: "Total Load Power",
    unit: "W",
    group: "load",
    addr: 653,
  }),
  def({ topic: "ac/ups/l1/power", label: "Load L1 Power", unit: "W", group: "load", addr: 650 }),
  def({ topic: "ac/ups/l2/power", label: "Load L2 Power", unit: "W", group: "load", addr: 651 }),
  def({ topic: "ac/ups/l3/power", label: "Load L3 Power", unit: "W", group: "load", addr: 652 }),
  def({
    topic: "ac/ups/l1/voltage",
    label: "Load Voltage L1",
    unit: "V",
    group: "load",
    addr: 644,
    scale: 0.1,
  }),
  def({
    topic: "ac/ups/l2/voltage",
    label: "Load Voltage L2",
    unit: "V",
    group: "load",
    addr: 645,
    scale: 0.1,
  }),
  def({
    topic: "ac/ups/l3/voltage",
    label: "Load Voltage L3",
    unit: "V",
    group: "load",
    addr: 646,
    scale: 0.1,
  }),
  def({
    topic: "ac/ups/daily_energy",
    label: "Daily Load Consumption",
    unit: "kWh",
    group: "load",
    addr: 526,
    scale: 0.1,
  }),
  def({
    topic: "ac/ups/total_energy",
    label: "Total Load Consumption",
    unit: "kWh",
    group: "load",
    type: "U_DWORD",
    addr: [527, 528],
    scale: 0.1,
  }),
];

const baseMetrics: MetricDef[] = [
  ...inverter,
  ...battery,
  ...generator,
  ...settings,
  ...system,
  ...timeOfUse,
  ...load,
];

/** Semantic overlay: maps device metrics onto the canonical UI vocabulary. */
type Semantic = Pick<MetricDef, "role" | "index" | "kind" | "range" | "enumLabels" | "flow">;

const CHARGE_FLOW = { positive: "Charging", negative: "Discharging" } as const;
const GRID_FLOW = { positive: "Importing", negative: "Exporting" } as const;

const SEMANTICS: Record<string, Partial<Semantic>> = {
  // --- inverter / status ---
  "inverter.status": {
    role: "inverter.status",
    kind: "status",
    enumLabels: { 0: "Standby", 1: "Self-check", 2: "Normal", 3: "Alarm", 4: "Fault" },
  },
  "ac.relay_status": {
    role: "inverter.relay_status",
    kind: "status",
    enumLabels: { 0: "Open", 1: "Closed" },
  },
  radiator_temp: { role: "inverter.temperature.dc" },
  "ac.temperature": { role: "inverter.temperature.ac" },

  // --- PV strings ---
  "dc.pv1.power": { role: "pv.string.power", index: 1 },
  "dc.pv2.power": { role: "pv.string.power", index: 2 },
  "dc.pv1.voltage": { role: "pv.string.voltage", index: 1 },
  "dc.pv2.voltage": { role: "pv.string.voltage", index: 2 },
  "dc.pv1.current": { role: "pv.string.current", index: 1 },
  "dc.pv2.current": { role: "pv.string.current", index: 2 },
  "dc.total_power": { role: "pv.total.power" },
  day_energy: { role: "production.today" },
  total_energy: { role: "production.total" },

  // --- grid ---
  "ac.total_power": { role: "grid.power", flow: GRID_FLOW },
  "ac.l1.voltage": { role: "grid.phase.voltage", index: 1 },
  "ac.l2.voltage": { role: "grid.phase.voltage", index: 2 },
  "ac.l3.voltage": { role: "grid.phase.voltage", index: 3 },
  "ac.l1.current": { role: "grid.phase.current", index: 1, flow: GRID_FLOW },
  "ac.l2.current": { role: "grid.phase.current", index: 2, flow: GRID_FLOW },
  "ac.l3.current": { role: "grid.phase.current", index: 3, flow: GRID_FLOW },
  "ac.l1.ct.internal": { role: "grid.phase.power", index: 1, flow: GRID_FLOW },
  "ac.l2.ct.internal": { role: "grid.phase.power", index: 2, flow: GRID_FLOW },
  "ac.l3.ct.internal": { role: "grid.phase.power", index: 3, flow: GRID_FLOW },
  "ac.daily_energy_bought": { role: "grid.energy.imported.today" },
  "ac.total_energy_bought": { role: "grid.energy.imported.total" },
  "ac.daily_energy_sold": { role: "grid.energy.exported.today" },
  "ac.total_energy_sold": { role: "grid.energy.exported.total" },

  // --- battery ---
  "battery.soc": { role: "battery.soc", range: { min: 0, max: 100 } },
  "battery.power": { role: "battery.power", flow: CHARGE_FLOW },
  "battery.voltage": { role: "battery.voltage" },
  "battery.current": { role: "battery.current", flow: CHARGE_FLOW },
  "battery.temperature": { role: "battery.temperature" },
  "battery.daily_charge": { role: "battery.energy.charged.today" },
  "battery.daily_discharge": { role: "battery.energy.discharged.today" },
  "battery.total_charge": { role: "battery.energy.charged.total" },
  "battery.total_discharge": { role: "battery.energy.discharged.total" },

  // --- backup / load ---
  "ac.ups.total_power": { role: "load.power" },
  "ac.ups.l1.power": { role: "load.phase.power", index: 1 },
  "ac.ups.l2.power": { role: "load.phase.power", index: 2 },
  "ac.ups.l3.power": { role: "load.phase.power", index: 3 },
  "ac.ups.l1.voltage": { role: "load.phase.voltage", index: 1 },
  "ac.ups.l2.voltage": { role: "load.phase.voltage", index: 2 },
  "ac.ups.l3.voltage": { role: "load.phase.voltage", index: 3 },
  "ac.ups.daily_energy": { role: "load.energy.today" },
  "ac.ups.total_energy": { role: "load.energy.total" },

  // --- generator ---
  "ac.generator.a.voltage": { role: "generator.phase.voltage", index: 1 },
  "ac.generator.b.voltage": { role: "generator.phase.voltage", index: 2 },
  "ac.generator.c.voltage": { role: "generator.phase.voltage", index: 3 },
  "ac.generator.a.power": { role: "generator.phase.power", index: 1 },
  "ac.generator.b.power": { role: "generator.phase.power", index: 2 },
  "ac.generator.c.power": { role: "generator.phase.power", index: 3 },
  "ac.generator.total_power": { role: "generator.power" },
  "ac.generator.daily_energy": { role: "generator.energy.today" },

  // --- settings / controls ---
  "settings.battery.maximum_charge_current": { role: "setting.battery.max_charge_current" },
  "settings.battery.maximum_discharge_current": { role: "setting.battery.max_discharge_current" },
  "settings.battery.maximum_grid_charge_current": {
    role: "setting.battery.max_grid_charge_current",
  },
  "settings.battery.grid_charge": {
    role: "setting.battery.grid_charge",
    enumLabels: { 0: "Off", 1: "On" },
  },
  "settings.workmode": {
    role: "setting.work_mode",
    enumLabels: { 0: "Selling First", 1: "Zero Export to Load", 2: "Zero Export to CT" },
  },
  "settings.solar_sell_max_power": { role: "setting.solar_sell.max_power" },
  "settings.solar_sell": { role: "setting.solar_sell.enabled", enumLabels: { 0: "Off", 1: "On" } },
};

export const metrics: MetricDef[] = baseMetrics.map((m) => {
  const semantic = SEMANTICS[m.key];
  return semantic ? { ...m, ...semantic } : m;
});
