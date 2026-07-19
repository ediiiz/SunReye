import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { InverterConnection, MetricDef } from "./types";

/**
 * In-memory stand-in for modbus-serial's ModbusRTU client. The driver only
 * touches this surface (connect/setID/setTimeout/read/write/close/isOpen), so
 * mocking the module keeps every test off the network. `mock.module` is
 * process-global, but only `driver.ts` imports modbus-serial and no other test
 * opens a real connection, so the fake is a safe drop-in for the whole run.
 */
class FakeModbusRTU {
  static instances: FakeModbusRTU[] = [];
  static connectMode: "ok" | "hang" = "ok";
  static registers = new Map<number, number>();
  static failNextRead = false;
  static connects: { method: "tcp" | "rtu"; host: string; port: number }[] = [];
  static reads: { start: number; count: number }[] = [];
  static writes: { addr: number; values: number[] }[] = [];

  static reset(): void {
    FakeModbusRTU.instances = [];
    FakeModbusRTU.connectMode = "ok";
    FakeModbusRTU.registers = new Map();
    FakeModbusRTU.failNextRead = false;
    FakeModbusRTU.connects = [];
    FakeModbusRTU.reads = [];
    FakeModbusRTU.writes = [];
  }

  isOpen = false;
  unitId: number | null = null;
  timeoutMs: number | null = null;
  closeCalls = 0;

  constructor() {
    FakeModbusRTU.instances.push(this);
  }

  private async connect(method: "tcp" | "rtu", host: string, opts: { port: number }) {
    FakeModbusRTU.connects.push({ method, host, port: opts.port });
    if (FakeModbusRTU.connectMode === "hang") return new Promise<never>(() => {});
    this.isOpen = true;
  }

  connectTCP(host: string, opts: { port: number }): Promise<void> {
    return this.connect("tcp", host, opts) as Promise<void>;
  }

  connectTcpRTUBuffered(host: string, opts: { port: number }): Promise<void> {
    return this.connect("rtu", host, opts) as Promise<void>;
  }

  setID(id: number): void {
    this.unitId = id;
  }

  setTimeout(ms: number): void {
    this.timeoutMs = ms;
  }

  async readHoldingRegisters(start: number, count: number): Promise<{ data: number[] }> {
    FakeModbusRTU.reads.push({ start, count });
    if (FakeModbusRTU.failNextRead) {
      FakeModbusRTU.failNextRead = false;
      throw new Error("Modbus exception: read failed");
    }
    const data = Array.from(
      { length: count },
      (_, i) => FakeModbusRTU.registers.get(start + i) ?? 0,
    );
    return { data };
  }

  async writeRegisters(addr: number, values: number[]): Promise<void> {
    FakeModbusRTU.writes.push({ addr, values });
  }

  close(cb?: () => void): void {
    this.isOpen = false;
    this.closeCalls += 1;
    cb?.();
  }
}

mock.module("modbus-serial", () => ({ default: FakeModbusRTU }));

const { ModbusInverter, planReads } = await import("./driver");

const def = (over: Partial<MetricDef> & { key: string }): MetricDef => ({
  topic: over.key.replaceAll(".", "/"),
  label: over.key,
  unit: null,
  group: "test",
  type: "U_WORD",
  addresses: [100],
  scale: 1,
  access: "r",
  ...over,
});

const conn = (over: Partial<InverterConnection> = {}): InverterConnection => ({
  host: "192.0.2.10",
  port: 502,
  unitId: 3,
  timeoutMs: 25,
  ...over,
});

beforeEach(() => {
  FakeModbusRTU.reset();
});

describe("planReads", () => {
  test("collapses adjacent addresses into one block", () => {
    const blocks = planReads([
      def({ key: "a", addresses: [100] }),
      def({ key: "b", addresses: [101] }),
      def({ key: "c", addresses: [102] }),
    ]);
    expect(blocks).toEqual([{ start: 100, count: 3 }]);
  });

  test("splits on gaps", () => {
    const blocks = planReads([
      def({ key: "a", addresses: [100] }),
      def({ key: "b", addresses: [200] }),
    ]);
    expect(blocks).toEqual([
      { start: 100, count: 1 },
      { start: 200, count: 1 },
    ]);
  });

  test("includes both U_DWORD words and dedupes shared addresses", () => {
    const blocks = planReads([
      def({ key: "total", type: "U_DWORD", addresses: [534, 535] }),
      def({ key: "dup", addresses: [534] }),
    ]);
    expect(blocks).toEqual([{ start: 534, count: 2 }]);
  });

  test("skips RAW and addressless (computed) metrics", () => {
    const blocks = planReads([
      def({ key: "time", type: "RAW", addresses: [22, 23, 24] }),
      def({ key: "calc", addresses: [] }),
    ]);
    expect(blocks).toEqual([]);
  });

  test("caps a block at the per-request register limit", () => {
    const blocks = planReads([
      def({ key: "a", addresses: [0] }),
      def({ key: "b", addresses: [1] }),
      def({ key: "c", addresses: [2] }),
    ]);
    // Force a run longer than MAX_BLOCK by chaining contiguous addresses.
    const metrics = Array.from({ length: 130 }, (_, i) => def({ key: `m${i}`, addresses: [i] }));
    const capped = planReads(metrics);
    expect(capped).toEqual([
      { start: 0, count: 120 },
      { start: 120, count: 10 },
    ]);
    expect(blocks).toEqual([{ start: 0, count: 3 }]);
  });
});

/** PV power + signed battery power + dword energy + a rw setting + computed sum. */
function profile() {
  return {
    id: "driver-test",
    name: "Driver Test",
    manufacturer: "Test",
    metrics: [
      def({ key: "dc.pv1.power", addresses: [672], scale: 1 }),
      def({ key: "battery.power", type: "S_WORD", addresses: [673], scale: 1 }),
      def({ key: "production.total", type: "U_DWORD", addresses: [674, 675], scale: 0.1 }),
      def({ key: "settings.limit", addresses: [700], scale: 0.1, access: "rw" }),
      def({ key: "settings.mode", type: "S_WORD", addresses: [701], scale: 1, access: "rw" }),
      def({ key: "settings.time", type: "RAW", addresses: [22, 23, 24], access: "rw" }),
      def({ key: "settings.wide", type: "U_DWORD", addresses: [710, 711], access: "rw" }),
      def({
        key: "site.power",
        addresses: [],
        compute: (v) => (v["dc.pv1.power"] ?? 0) + (v["battery.power"] ?? 0),
      }),
    ],
  };
}

describe("ModbusInverter — read", () => {
  test("reads planned blocks once, decodes every register-backed metric", async () => {
    FakeModbusRTU.registers = new Map([
      [672, 4200],
      [673, 0x10000 - 1500], // -1500 W discharging
      [674, 5000],
      [675, 2], // dword 136072 → 13607.2
      [700, 805],
      [701, 3],
    ]);
    const inv = new ModbusInverter(profile(), conn());
    const sample = await inv.read();

    expect(sample.inverterId).toBe("driver-test");
    expect(sample.metrics["dc.pv1.power"]).toBe(4200);
    expect(sample.metrics["battery.power"]).toBe(-1500);
    expect(sample.metrics["production.total"]).toBeCloseTo(13607.2);
    expect(sample.metrics["settings.limit"]).toBeCloseTo(80.5);
    expect(sample.metrics["settings.time"]).toBeUndefined(); // RAW: no numeric value
    expect(sample.metrics["site.power"]).toBe(2700); // computed after decode

    // 672..675 + 700..701 + 710..711 are contiguous runs; 22..24 is RAW (skipped).
    expect(FakeModbusRTU.reads).toEqual([
      { start: 672, count: 4 },
      { start: 700, count: 2 },
      { start: 710, count: 2 },
    ]);
    const client = FakeModbusRTU.instances[0];
    expect(client?.unitId).toBe(3);
    expect(client?.timeoutMs).toBe(25);
  });

  test("reuses the open client across reads and shares one in-flight connect", async () => {
    const inv = new ModbusInverter(profile(), conn());
    await Promise.all([inv.read(), inv.read()]); // concurrent: one connect
    await inv.read(); // open: no reconnect
    expect(FakeModbusRTU.connects).toHaveLength(1);
    expect(FakeModbusRTU.instances).toHaveLength(1);
  });

  test("rtu-over-tcp transport connects with RTU framing", async () => {
    const inv = new ModbusInverter(profile(), conn({ transport: "rtu-over-tcp" }));
    await inv.read();
    expect(FakeModbusRTU.connects).toEqual([{ method: "rtu", host: "192.0.2.10", port: 502 }]);
  });

  test("an unreachable host fails fast on the connect timeout and can retry", async () => {
    FakeModbusRTU.connectMode = "hang";
    const inv = new ModbusInverter(profile(), conn({ timeoutMs: 20 }));
    await expect(inv.read()).rejects.toThrow(/connect to 192\.0\.2\.10:502 timed out/);
    expect(FakeModbusRTU.instances[0]?.closeCalls).toBe(1); // aborted socket closed

    FakeModbusRTU.connectMode = "ok"; // host comes back → a fresh connect succeeds
    await expect(inv.read()).resolves.toBeDefined();
    expect(FakeModbusRTU.connects).toHaveLength(2);
  });

  test("a failed transaction rejects but keeps the lock chain alive", async () => {
    const inv = new ModbusInverter(profile(), conn());
    FakeModbusRTU.failNextRead = true;
    await expect(inv.read()).rejects.toThrow(/read failed/);
    await expect(inv.read()).resolves.toBeDefined(); // next transaction still runs
  });
});

describe("ModbusInverter — write", () => {
  test("encodes the engineering value and writes via FC16", async () => {
    const inv = new ModbusInverter(profile(), conn());
    await inv.write("settings.limit", 80.5); // scale 0.1 → raw 805
    await inv.write("settings.mode", -2); // S_WORD → two's complement
    expect(FakeModbusRTU.writes).toEqual([
      { addr: 700, values: [805] },
      { addr: 701, values: [0x10000 - 2] },
    ]);
  });

  test("rejects unknown, read-only, and non-single-word metrics", async () => {
    const inv = new ModbusInverter(profile(), conn());
    await expect(inv.write("no.such", 1)).rejects.toThrow(/unknown metric/);
    await expect(inv.write("dc.pv1.power", 1)).rejects.toThrow(/read-only/);
    await expect(inv.write("settings.time", 1)).rejects.toThrow(/not a single-word/);
    await expect(inv.write("settings.wide", 1)).rejects.toThrow(/not a single-word/);
    expect(FakeModbusRTU.writes).toHaveLength(0);
    expect(FakeModbusRTU.connects).toHaveLength(0); // rejected before connecting
  });
});

describe("ModbusInverter — close", () => {
  test("closes an open client and forgets it", async () => {
    const inv = new ModbusInverter(profile(), conn());
    await inv.read();
    await inv.close();
    expect(FakeModbusRTU.instances[0]?.closeCalls).toBe(1);
    await inv.close(); // idempotent: nothing left to close
    expect(FakeModbusRTU.instances[0]?.closeCalls).toBe(1);
  });

  test("resolves when never connected", async () => {
    const inv = new ModbusInverter(profile(), conn());
    await expect(inv.close()).resolves.toBeUndefined();
  });
});
