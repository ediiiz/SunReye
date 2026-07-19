import { describe, expect, test } from "bun:test";

import { appSettings, installedProfiles } from "./settings";

// Pure schema-shape tests: the only runtime code in this module is the
// `$onUpdate` callback on `app_settings.updated_at`, so invoke it directly —
// no database involved.
describe("app_settings schema", () => {
  test("updated_at refreshes to the current time via its $onUpdate callback", () => {
    const onUpdateFn = (appSettings.updatedAt as { onUpdateFn?: () => unknown }).onUpdateFn;
    expect(typeof onUpdateFn).toBe("function");

    const before = Date.now();
    const value = onUpdateFn!();
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((value as Date).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("key is the primary key and value/updated_at are required", () => {
    expect(appSettings.key.primary).toBe(true);
    expect(appSettings.value.notNull).toBe(true);
    expect(appSettings.updatedAt.notNull).toBe(true);
    expect(appSettings.updatedAt.hasDefault).toBe(true);
  });
});

describe("installed_profiles schema", () => {
  test("id is the primary key and installed_at defaults in the database", () => {
    expect(installedProfiles.id.primary).toBe(true);
    expect(installedProfiles.source.notNull).toBe(true);
    expect(installedProfiles.version.notNull).toBe(true);
    expect(installedProfiles.data.notNull).toBe(true);
    expect(installedProfiles.installedAt.hasDefault).toBe(true);
  });
});
