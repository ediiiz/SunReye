import { env } from "@ReyeON/env/server";
import ModbusRTU from "modbus-serial";

/**
 * Deye holding-register map. Addresses are placeholders — adjust to your
 * inverter's Modbus documentation. Each entry is a single 16-bit register.
 */
const REGISTERS = {
  pvPowerW: 672,
  batterySoc: 588,
  gridPowerW: 625,
} as const;

/** Writable settings exposed through the command API. */
const WRITABLE_REGISTERS = {
  chargeAmps: 108,
  dischargeAmps: 109,
} as const;

export type WritableSetting = keyof typeof WRITABLE_REGISTERS;

export interface MetricsSample {
  time: string;
  pvPowerW: number;
  batterySoc: number;
  gridPowerW: number;
}

let client: ModbusRTU | null = null;
let connecting: Promise<ModbusRTU> | null = null;

async function getClient(): Promise<ModbusRTU> {
  if (client?.isOpen) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const next = new ModbusRTU();
    await next.connectTCP(env.DEYE_HOST, { port: env.DEYE_PORT });
    next.setID(env.DEYE_UNIT_ID);
    next.setTimeout(2000);
    client = next;
    connecting = null;
    return next;
  })();

  return connecting;
}

function simulate(): MetricsSample {
  const t = Date.now() / 1000;
  return {
    time: new Date().toISOString(),
    pvPowerW: Math.max(0, Math.round(3000 + 2000 * Math.sin(t / 60))),
    batterySoc: Math.min(100, Math.max(0, Math.round(60 + 30 * Math.sin(t / 300)))),
    gridPowerW: Math.round(1500 * Math.cos(t / 45)),
  };
}

/** Reads one live sample from the inverter (or synthesizes it in sim mode). */
export async function readMetrics(): Promise<MetricsSample> {
  if (env.DEYE_SIMULATE) return simulate();

  const c = await getClient();
  const first = Math.min(...Object.values(REGISTERS));
  const last = Math.max(...Object.values(REGISTERS));
  const { data } = await c.readHoldingRegisters(first, last - first + 1);
  const read = (addr: number) => data[addr - first] ?? 0;

  return {
    time: new Date().toISOString(),
    pvPowerW: read(REGISTERS.pvPowerW),
    batterySoc: read(REGISTERS.batterySoc),
    gridPowerW: read(REGISTERS.gridPowerW),
  };
}

/** Writes a single setting register on the inverter. No-op in sim mode. */
export async function writeSetting(setting: WritableSetting, value: number): Promise<void> {
  if (env.DEYE_SIMULATE) return;
  const c = await getClient();
  await c.writeRegister(WRITABLE_REGISTERS[setting], value);
}
