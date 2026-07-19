import { describe, expect, test } from "bun:test";

import { inverterConfigSchema } from "./inverter-config";

/** Paths of the custom issues raised by the connection range checks. */
function issuePaths(input: object): string[] {
  const result = inverterConfigSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join("."));
}

describe("inverter config", () => {
  test("a fresh (empty) config parses to valid defaults", () => {
    const parsed = inverterConfigSchema.parse({});
    expect(parsed).toEqual({
      host: undefined,
      port: 502,
      transport: "tcp",
      unitId: 0,
      timeoutMs: 2000,
      pollIntervalMs: 1000,
    });
  });

  test("accepts an rtu-over-tcp gateway target", () => {
    const parsed = inverterConfigSchema.parse({
      host: "gateway.lan",
      port: 8899,
      transport: "rtu-over-tcp",
      unitId: 1,
    });
    expect(parsed.transport).toBe("rtu-over-tcp");
    expect(parsed.port).toBe(8899);
  });

  test("range checks flag out-of-range port, unit id, and timeout", () => {
    expect(issuePaths({ port: 0 })).toEqual(["port"]);
    expect(issuePaths({ port: 65_536 })).toEqual(["port"]);
    expect(issuePaths({ unitId: -1 })).toEqual(["unitId"]);
    expect(issuePaths({ unitId: 256 })).toEqual(["unitId"]);
    expect(issuePaths({ timeoutMs: 99 })).toEqual(["timeoutMs"]);
    expect(issuePaths({ timeoutMs: 60_001 })).toEqual(["timeoutMs"]);
  });

  test("reports every failing connection check at once", () => {
    expect(issuePaths({ port: 0, unitId: 999, timeoutMs: 1 })).toEqual([
      "port",
      "unitId",
      "timeoutMs",
    ]);
  });

  test("poll interval is floored at 1000 ms by the schema itself", () => {
    expect(inverterConfigSchema.safeParse({ pollIntervalMs: 999 }).success).toBe(false);
    expect(inverterConfigSchema.safeParse({ pollIntervalMs: 3_600_001 }).success).toBe(false);
    expect(inverterConfigSchema.parse({ pollIntervalMs: 5000 }).pollIntervalMs).toBe(5000);
  });
});
