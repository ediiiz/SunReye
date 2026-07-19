import { afterAll, describe, expect, test } from "bun:test";

import { ModbusInverter } from "./driver";
import {
  createInverter,
  getProfile,
  listProfiles,
  registerProfile,
  tryGetProfile,
  unregisterProfile,
} from "./registry";
import { SimulatedInverter } from "./simulator";
import type { InverterConnection, InverterProfile } from "./types";

// The registry is process-global and shared with other test files, so use
// unique ids and clean up after ourselves; never assert on global counts.
const ID = "registry-test-acme-9k";

const profile: InverterProfile = {
  id: ID,
  name: "Registry Test",
  manufacturer: "Acme",
  metrics: [
    {
      key: "battery.soc",
      topic: "battery/soc",
      label: "SOC",
      unit: "%",
      group: "battery",
      type: "U_WORD",
      addresses: [588],
      scale: 1,
      access: "r",
      role: "battery.soc",
    },
  ],
};

const connection: InverterConnection = { host: "192.0.2.1", port: 502, unitId: 1 };

afterAll(() => {
  unregisterProfile(ID);
});

describe("profile registry", () => {
  test("registerProfile returns the profile and makes it resolvable", () => {
    expect(registerProfile(profile)).toBe(profile);
    expect(getProfile(ID)).toBe(profile);
    expect(tryGetProfile(ID)).toBe(profile);
    expect(listProfiles()).toContain(profile);
  });

  test("getProfile throws for an unknown id, naming the installed ones", () => {
    registerProfile(profile);
    expect(() => getProfile("registry-test-no-such")).toThrow(
      /unknown inverter profile "registry-test-no-such"/,
    );
    expect(() => getProfile("registry-test-no-such")).toThrow(new RegExp(ID));
  });

  test("tryGetProfile returns undefined instead of throwing", () => {
    expect(tryGetProfile("registry-test-no-such")).toBeUndefined();
  });

  test("unregisterProfile reports whether the id was present", () => {
    registerProfile(profile);
    expect(unregisterProfile(ID)).toBe(true);
    expect(unregisterProfile(ID)).toBe(false);
    expect(tryGetProfile(ID)).toBeUndefined();
  });
});

describe("createInverter", () => {
  test("simulate: true builds a SimulatedInverter", () => {
    const src = createInverter(profile, { simulate: true, connection });
    expect(src).toBeInstanceOf(SimulatedInverter);
    expect(src.profile.id).toBe(ID);
  });

  test("simulate: false builds a ModbusInverter (no connection until read)", () => {
    const src = createInverter(profile, { simulate: false, connection });
    expect(src).toBeInstanceOf(ModbusInverter);
    expect(src.profile.id).toBe(ID);
  });
});
