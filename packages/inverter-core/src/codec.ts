import type { MetricDef, RegisterType } from "./types";

/** Number of 16-bit registers a type occupies (for contiguous-read planning). */
export function registerWidth(type: RegisterType, addresses: number[]): number {
  switch (type) {
    case "U_DWORD":
      return 2;
    case "RAW":
      return addresses.length;
    default:
      return 1;
  }
}

function toSigned16(v: number): number {
  return v > 0x7fff ? v - 0x10000 : v;
}

/**
 * Decode a metric from raw register words keyed by absolute address.
 * Returns `undefined` for `RAW`/unreadable metrics.
 */
export function decode(def: MetricDef, regs: ReadonlyMap<number, number>): number | undefined {
  const [a0, a1] = def.addresses;
  const offset = def.offset ?? 0;
  switch (def.type) {
    case "U_WORD":
      return a0 === undefined ? undefined : (regs.get(a0) ?? 0) * def.scale + offset;
    case "S_WORD":
      return a0 === undefined ? undefined : toSigned16(regs.get(a0) ?? 0) * def.scale + offset;
    case "U_DWORD": {
      if (a0 === undefined || a1 === undefined) return undefined;
      // Low word first, high word second (LW,HW). Avoid bit-shift so the
      // 32-bit value stays an exact double rather than a signed int32.
      const raw = (regs.get(a0) ?? 0) + (regs.get(a1) ?? 0) * 0x10000;
      return raw * def.scale + offset;
    }
    case "RAW":
      return undefined;
  }
}

/**
 * Encode an engineering value back to a single 16-bit register word.
 * Only `U_WORD`/`S_WORD` settings are writable.
 */
export function encodeWord(def: MetricDef, value: number): number {
  const raw = Math.round((value - (def.offset ?? 0)) / def.scale);
  if (def.type === "S_WORD") return raw < 0 ? raw + 0x10000 : raw;
  return raw & 0xffff;
}
