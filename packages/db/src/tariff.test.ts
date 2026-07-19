import { describe, expect, test } from "bun:test";

import {
  defaultTariff,
  importBandForHour,
  importPriceForHour,
  tariffConfigSchema,
  type TariffConfig,
} from "./tariff";

/** A tariff with a default rate and the given import bands. */
const withBands = (bands: TariffConfig["import"]["bands"]): TariffConfig =>
  tariffConfigSchema.parse({ import: { defaultPricePerKwh: 0.3, bands } });

const night = { name: "Night", pricePerKwh: 0.2, startHour: 22, endHour: 6 };
const peak = { name: "Peak", pricePerKwh: 0.45, startHour: 17, endHour: 21 };

describe("tariff config", () => {
  test("defaults are all-zero EUR before a tariff is configured", () => {
    expect(defaultTariff.currency).toBe("EUR");
    expect(defaultTariff.standingChargeMonthly).toBe(0);
    expect(defaultTariff.import).toEqual({ defaultPricePerKwh: 0, bands: [] });
    expect(defaultTariff.export.feedInPerKwh).toBe(0);
  });

  test("rejects a non-ISO currency and negative prices", () => {
    expect(tariffConfigSchema.safeParse({ currency: "EURO" }).success).toBe(false);
    expect(tariffConfigSchema.safeParse({ import: { defaultPricePerKwh: -0.1 } }).success).toBe(
      false,
    );
  });
});

describe("importBandForHour", () => {
  test("matches a same-day window on [startHour, endHour)", () => {
    const t = withBands([peak]);
    expect(importBandForHour(t, 17, 3)?.name).toBe("Peak");
    expect(importBandForHour(t, 20, 3)?.name).toBe("Peak");
    expect(importBandForHour(t, 21, 3)).toBeNull(); // endHour is exclusive
    expect(importBandForHour(t, 16, 3)).toBeNull();
  });

  test("matches a band that wraps midnight on both sides", () => {
    const t = withBands([night]);
    expect(importBandForHour(t, 23, 3)?.name).toBe("Night");
    expect(importBandForHour(t, 2, 3)?.name).toBe("Night");
    expect(importBandForHour(t, 6, 3)).toBeNull(); // endHour still exclusive
    expect(importBandForHour(t, 12, 3)).toBeNull();
  });

  test("skips a band whose days do not include the weekday", () => {
    const weekendPeak = { ...peak, days: [6, 7] };
    const t = withBands([weekendPeak]);
    expect(importBandForHour(t, 18, 6)?.name).toBe("Peak"); // Saturday
    expect(importBandForHour(t, 18, 1)).toBeNull(); // Monday
  });

  test("returns the first matching band when windows overlap", () => {
    const t = withBands([peak, { ...night, startHour: 17, endHour: 22 }]);
    expect(importBandForHour(t, 18, 3)?.name).toBe("Peak");
  });
});

describe("importPriceForHour", () => {
  test("uses the matching band's price, else the default rate", () => {
    const t = withBands([peak]);
    expect(importPriceForHour(t, 18, 3)).toBe(0.45);
    expect(importPriceForHour(t, 10, 3)).toBe(0.3); // no band → default
  });
});
