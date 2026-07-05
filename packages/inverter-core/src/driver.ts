import ModbusRTU from "modbus-serial";

import { decode, encodeWord } from "./codec";
import type {
  InverterConnection,
  InverterProfile,
  InverterSample,
  InverterSource,
  MetricDef,
  MetricValues,
} from "./types";

/** Modbus caps a single read at 125 registers; stay under it. */
const MAX_BLOCK = 120;

interface ReadBlock {
  start: number;
  count: number;
}

/**
 * Collapse every readable address in the profile into contiguous read blocks,
 * splitting on gaps and the per-request register cap. Computed metrics (no
 * addresses) are skipped.
 */
export function planReads(metrics: MetricDef[]): ReadBlock[] {
  const addresses = new Set<number>();
  for (const m of metrics) {
    if (m.type === "RAW" || m.addresses.length === 0) continue;
    // U_DWORD lists explicit [low, high]; single-word types occupy one register
    // from the base address. (RAW / addressless metrics are skipped above.)
    if (m.type === "U_DWORD") {
      for (const a of m.addresses) addresses.add(a);
    } else {
      addresses.add(m.addresses[0]!);
    }
  }

  const sorted = [...addresses].sort((a, b) => a - b);
  const blocks: ReadBlock[] = [];
  for (const addr of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && addr <= last.start + last.count && addr - last.start < MAX_BLOCK) {
      last.count = Math.max(last.count, addr - last.start + 1);
    } else {
      blocks.push({ start: addr, count: 1 });
    }
  }
  return blocks;
}

/** Generic Modbus-TCP source that reads/writes any {@link InverterProfile}. */
export class ModbusInverter implements InverterSource {
  readonly profile: InverterProfile;
  private readonly conn: InverterConnection;
  private readonly blocks: ReadBlock[];
  private client: ModbusRTU | null = null;
  private connecting: Promise<ModbusRTU> | null = null;

  constructor(profile: InverterProfile, conn: InverterConnection) {
    this.profile = profile;
    this.conn = conn;
    this.blocks = planReads(profile.metrics);
  }

  private async getClient(): Promise<ModbusRTU> {
    if (this.client?.isOpen) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const next = new ModbusRTU();
      const timeout = this.conn.timeoutMs ?? 2000;
      const opts = { port: this.conn.port };
      // Modbus TCP (MBAP framing) vs RTU frames tunneled over the socket, the
      // latter common with RS485→Ethernet gateways.
      const connect =
        this.conn.transport === "rtu-over-tcp"
          ? next.connectTcpRTUBuffered(this.conn.host, opts)
          : next.connectTCP(this.conn.host, opts);
      try {
        // The connect call itself has no timeout, so an unreachable host would
        // hang forever; race it so a bad address fails fast (test-connection,
        // polling).
        await Promise.race([
          connect,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`connect to ${this.conn.host}:${this.conn.port} timed out`)),
              timeout,
            ),
          ),
        ]);
      } catch (err) {
        next.close(() => {});
        this.connecting = null;
        throw err;
      }
      next.setID(this.conn.unitId);
      next.setTimeout(timeout);
      this.client = next;
      this.connecting = null;
      return next;
    })();
    return this.connecting;
  }

  async read(): Promise<InverterSample> {
    const client = await this.getClient();
    const regs = new Map<number, number>();
    for (const block of this.blocks) {
      const { data } = await client.readHoldingRegisters(block.start, block.count);
      data.forEach((word, i) => regs.set(block.start + i, word));
    }

    const metrics: MetricValues = {};
    for (const def of this.profile.metrics) {
      if (def.compute) continue;
      const value = decode(def, regs);
      if (value !== undefined) metrics[def.key] = value;
    }
    applyComputed(this.profile.metrics, metrics);

    return { time: new Date().toISOString(), inverterId: this.profile.id, metrics };
  }

  async write(key: string, value: number): Promise<void> {
    const def = this.profile.metrics.find((m) => m.key === key);
    if (!def) throw new Error(`unknown metric: ${key}`);
    if (def.access !== "rw") throw new Error(`metric is read-only: ${key}`);
    if (def.addresses.length !== 1 || (def.type !== "U_WORD" && def.type !== "S_WORD")) {
      throw new Error(`metric is not a single-word writable register: ${key}`);
    }
    const client = await this.getClient();
    await client.writeRegister(def.addresses[0]!, encodeWord(def, value));
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.client?.isOpen) this.client.close(() => resolve());
      else resolve();
    });
    this.client = null;
  }
}

/** Run every computed metric against the current values (mutates in place). */
export function applyComputed(metrics: MetricDef[], values: MetricValues): void {
  for (const def of metrics) {
    if (def.compute) values[def.key] = def.compute(values);
  }
}
