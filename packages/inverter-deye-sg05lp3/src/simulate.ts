import type { MetricValues, SimContext } from "@SunReye/inverter-core";

/**
 * Coherent solar-plant model. Rather than jittering each register
 * independently, we simulate one physical system (sun → PV → battery → grid →
 * load) and derive every metric from that shared state, so the numbers obey
 * energy balance and integrate sensibly over time.
 *
 * Sign conventions:
 *   battery.power   > 0 charging, < 0 discharging
 *   ac.total_power  > 0 importing from grid, < 0 exporting (selling)
 */

const PV_STRING_PEAK_W = 4000; // per MPPT string
const BATTERY_CAPACITY_KWH = 10;
const BATTERY_NOMINAL_V = 51.2;
const MIN_SOC = 15;
const BASE_LOAD_W = 450;

/** Concrete shape of the persisted state (typed view over `SimState`). */
interface PlantState {
  inited: number;
  dayKey: number;
  soc: number;
  dayEnergy: number;
  totalEnergy: number;
  dailyCharge: number;
  totalCharge: number;
  dailyDischarge: number;
  totalDischarge: number;
  dailyBought: number;
  totalBought: number;
  dailySold: number;
  totalSold: number;
  dailyLoad: number;
  totalLoad: number;
}

const round = (v: number, d = 0): number => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const jitter = (spread: number): number => 1 + (Math.random() - 0.5) * spread;

/** 0 at night, smooth bell peaking near solar noon (13:00). */
function irradiance(now: Date): number {
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const day = (h - 6) / 14; // sunrise ~06:00, sunset ~20:00
  if (day <= 0 || day >= 1) return 0;
  return Math.sin(Math.PI * day) ** 1.3;
}

function initState(s: PlantState): void {
  if (s.inited === 1) return;
  s.inited = 1;
  s.soc = 58;
  // Lifetime counters (kWh) — arbitrary but plausible starting odometer.
  s.totalEnergy = 12480;
  s.totalCharge = 6320;
  s.totalDischarge = 5910;
  s.totalBought = 4230;
  s.totalSold = 8115;
  s.totalLoad = 10870;
  s.dayKey = -1;
  s.dayEnergy = 0;
  s.dailyCharge = 0;
  s.dailyDischarge = 0;
  s.dailyBought = 0;
  s.dailySold = 0;
  s.dailyLoad = 0;
}

function resetDaily(s: PlantState, now: Date): void {
  const dayKey = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
  if (s.dayKey === dayKey) return;
  s.dayKey = dayKey;
  s.dayEnergy = 0;
  s.dailyCharge = 0;
  s.dailyDischarge = 0;
  s.dailyBought = 0;
  s.dailySold = 0;
  s.dailyLoad = 0;
}

export function simulate({ now, dtSec, state }: SimContext): MetricValues {
  const s = state as unknown as PlantState;
  initState(s);
  resetDaily(s, now);

  const irr = irradiance(now);

  // --- PV strings ---
  const pv1 = irr > 0 ? PV_STRING_PEAK_W * irr * jitter(0.08) : 0;
  const pv2 = irr > 0 ? PV_STRING_PEAK_W * irr * jitter(0.08) * 0.96 : 0;
  const pvTotal = pv1 + pv2;
  const pv1V = irr > 0.02 ? 330 * jitter(0.05) : 0;
  const pv2V = irr > 0.02 ? 335 * jitter(0.05) : 0;

  // --- Load: base draw + daytime activity + occasional spikes ---
  const spike = Math.random() < 0.05 ? 1500 * Math.random() : 0;
  const load = BASE_LOAD_W + 350 * irr + spike + BASE_LOAD_W * (jitter(0.2) - 1);

  // --- Battery dispatch to balance PV vs. load ---
  const surplus = pvTotal - load; // >0 excess solar, <0 shortfall
  let battPower = 0; // + charge / - discharge
  if (surplus > 0 && s.soc < 100) {
    battPower = Math.min(surplus, 3000); // absorb surplus up to charge limit
  } else if (surplus < 0 && s.soc > MIN_SOC) {
    battPower = Math.max(surplus, -3500); // discharge to cover shortfall
  }

  // Integrate SoC (skip on first sample where dtSec == 0).
  const battEnergyKwh = (battPower * dtSec) / 3_600_000;
  s.soc = Math.min(100, Math.max(MIN_SOC, s.soc + (battEnergyKwh / BATTERY_CAPACITY_KWH) * 100));
  const battV = BATTERY_NOMINAL_V + (s.soc - 50) * 0.03;
  const battCurrent = battPower / battV;
  const battTemp = 22 + 8 * irr + 4 * (Math.abs(battPower) / 3500);

  // --- Grid balances the remainder ---
  const grid = load + battPower - pvTotal; // >0 import, <0 export
  const gridV = [230, 230, 230].map((v) => v * jitter(0.02));
  const gridPhase = [grid / 3, grid / 3, grid / 3];
  const gridCurrent = gridPhase.map((p, i) => p / gridV[i]!);

  // Inverter AC output per phase feeds the load + any export.
  const invPhase = [1, 2, 3].map(() => (load + Math.max(-grid, 0)) / 3);

  // --- Energy integration (Wh → kWh) ---
  const wh = (w: number) => (Math.max(w, 0) * dtSec) / 3600 / 1000;
  s.dayEnergy += wh(pvTotal);
  s.totalEnergy += wh(pvTotal);
  s.dailyCharge += wh(battPower);
  s.totalCharge += wh(battPower);
  s.dailyDischarge += wh(-battPower);
  s.totalDischarge += wh(-battPower);
  s.dailyBought += wh(grid);
  s.totalBought += wh(grid);
  s.dailySold += wh(-grid);
  s.totalSold += wh(-grid);
  s.dailyLoad += wh(load);
  s.totalLoad += wh(load);

  const temp = 30 + 20 * irr + 5 * (load / 5000);

  return {
    "inverter.status": 2, // 2 = normal/running
    "ac.relay_status": 1,

    "dc.pv1.power": round(pv1),
    "dc.pv2.power": round(pv2),
    "dc.pv1.voltage": round(pv1V, 1),
    "dc.pv2.voltage": round(pv2V, 1),
    "dc.pv1.current": round(pv1V > 0 ? pv1 / pv1V : 0, 1),
    "dc.pv2.current": round(pv2V > 0 ? pv2 / pv2V : 0, 1),

    day_energy: round(s.dayEnergy, 1),
    total_energy: round(s.totalEnergy, 1),

    "ac.total_power": round(grid),
    "ac.l1.voltage": round(gridV[0]!, 1),
    "ac.l2.voltage": round(gridV[1]!, 1),
    "ac.l3.voltage": round(gridV[2]!, 1),
    "ac.l1.ct.internal": round(gridPhase[0]!),
    "ac.l2.ct.internal": round(gridPhase[1]!),
    "ac.l3.ct.internal": round(gridPhase[2]!),
    "ac.total_internal_power": round(grid),
    "ac.l1.current": round(gridCurrent[0]!, 2),
    "ac.l2.current": round(gridCurrent[1]!, 2),
    "ac.l3.current": round(gridCurrent[2]!, 2),
    "ac.l1.power": round(invPhase[0]!),
    "ac.l2.power": round(invPhase[1]!),
    "ac.l3.power": round(invPhase[2]!),

    "ac.daily_energy_bought": round(s.dailyBought, 1),
    "ac.total_energy_bought": round(s.totalBought, 1),
    "ac.daily_energy_sold": round(s.dailySold, 1),
    "ac.total_energy_sold": round(s.totalSold, 1),

    radiator_temp: round(temp, 1),
    "ac.temperature": round(temp - 4, 1),

    "battery.power": round(battPower),
    "battery.voltage": round(battV, 2),
    "battery.soc": round(s.soc),
    // Split the modeled current across the two BMS banks; the canonical
    // battery.current is computed as their sum (see metrics.ts).
    "battery.1.current": round(battCurrent / 2, 2),
    "battery.2.current": round(battCurrent / 2, 2),
    "battery.temperature": round(battTemp, 1),
    "battery.daily_charge": round(s.dailyCharge, 1),
    "battery.daily_discharge": round(s.dailyDischarge, 1),
    "battery.total_charge": round(s.totalCharge, 1),
    "battery.total_discharge": round(s.totalDischarge, 1),

    "ac.ups.total_power": round(load),
    "ac.ups.l1.power": round(load / 3),
    "ac.ups.l2.power": round(load / 3),
    "ac.ups.l3.power": round(load / 3),
    "ac.ups.l1.voltage": round(gridV[0]!, 1),
    "ac.ups.l2.voltage": round(gridV[1]!, 1),
    "ac.ups.l3.voltage": round(gridV[2]!, 1),
    "ac.ups.daily_energy": round(s.dailyLoad, 1),
    "ac.ups.total_energy": round(s.totalLoad, 1),

    // Stable configuration defaults (writes override these).
    "settings.battery.maximum_charge_current": 100,
    "settings.battery.maximum_discharge_current": 100,
    "settings.battery.maximum_grid_charge_current": 40,
    "settings.workmode": 2,
    "settings.solar_sell_max_power": 8000,
    "settings.solar_sell": 1,
  };
}
