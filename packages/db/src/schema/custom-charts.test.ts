import { describe, expect, test } from "bun:test";

import { customCharts } from "./custom-charts";

// Pure schema-shape tests: the only runtime code in this module is the
// `$onUpdate` callback on `custom_charts.updated_at`, so invoke it directly —
// no database involved.
describe("custom_charts schema", () => {
  test("updated_at refreshes to the current time via its $onUpdate callback", () => {
    const onUpdateFn = (customCharts.updatedAt as { onUpdateFn?: () => unknown }).onUpdateFn;
    expect(typeof onUpdateFn).toBe("function");

    const before = Date.now();
    const value = onUpdateFn!();
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((value as Date).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("id is the primary key and name/data/timestamps are required", () => {
    expect(customCharts.id.primary).toBe(true);
    expect(customCharts.name.notNull).toBe(true);
    expect(customCharts.data.notNull).toBe(true);
    expect(customCharts.createdAt.hasDefault).toBe(true);
    expect(customCharts.updatedAt.notNull).toBe(true);
  });
});
