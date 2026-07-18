import { describe, expect, test } from "bun:test";

import { defaultUiPrefs, uiPrefsSchema } from "./ui-prefs";

describe("ui prefs", () => {
  test("defaults to nothing hidden", () => {
    expect(defaultUiPrefs.hiddenKeys).toEqual([]);
    expect(defaultUiPrefs.hiddenGroups).toEqual([]);
  });

  test("fills missing arrays from defaults", () => {
    expect(uiPrefsSchema.parse({})).toEqual({ hiddenKeys: [], hiddenGroups: [] });
    expect(uiPrefsSchema.parse({ hiddenGroups: ["generator"] })).toEqual({
      hiddenKeys: [],
      hiddenGroups: ["generator"],
    });
  });

  test("round-trips a populated config", () => {
    const input = { hiddenKeys: ["gen_power", "gen_voltage"], hiddenGroups: ["generator"] };
    expect(uiPrefsSchema.parse(input)).toEqual(input);
  });

  test("rejects non-string entries and unknown keys", () => {
    expect(uiPrefsSchema.safeParse({ hiddenKeys: [1] }).success).toBe(false);
    expect(uiPrefsSchema.safeParse({ hiddenGroups: "generator" }).success).toBe(false);
    expect(uiPrefsSchema.safeParse({ extra: true }).success).toBe(false);
  });
});
