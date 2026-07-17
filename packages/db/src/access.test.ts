import { describe, expect, test } from "bun:test";

import { accessConfigSchema, defaultAccess } from "./access";

describe("access config", () => {
  test("defaults to locked down (public dashboard off)", () => {
    // Security invariant: an unconfigured instance must NOT expose reads anonymously.
    expect(defaultAccess.publicDashboard).toBe(false);
    expect(accessConfigSchema.parse({}).publicDashboard).toBe(false);
  });

  test("accepts an explicit toggle and rejects non-booleans", () => {
    expect(accessConfigSchema.parse({ publicDashboard: true }).publicDashboard).toBe(true);
    expect(accessConfigSchema.safeParse({ publicDashboard: "yes" }).success).toBe(false);
  });
});
