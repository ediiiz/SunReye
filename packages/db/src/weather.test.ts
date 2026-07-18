import { describe, expect, test } from "bun:test";

import { defaultWeather, forecastReady, weatherConfigSchema, weatherReady } from "./weather";

describe("weather config", () => {
  test("defaults to disabled with no location", () => {
    expect(defaultWeather.enabled).toBe(false);
    expect(defaultWeather.latitude).toBeNull();
    expect(defaultWeather.longitude).toBeNull();
  });

  test("rejects out-of-range coordinates", () => {
    expect(weatherConfigSchema.safeParse({ latitude: 91, longitude: 0 }).success).toBe(false);
    expect(weatherConfigSchema.safeParse({ latitude: 0, longitude: 181 }).success).toBe(false);
  });

  test("weatherReady requires enabled + both coordinates", () => {
    const base = defaultWeather;
    expect(weatherReady(base)).toBe(false);
    expect(weatherReady({ ...base, enabled: true, latitude: 50, longitude: null })).toBe(false);
    expect(weatherReady({ ...base, enabled: false, latitude: 50, longitude: 8 })).toBe(false);
    expect(weatherReady({ ...base, enabled: true, latitude: 50, longitude: 8 })).toBe(true);
  });

  test("legacy configs without forecast parse with sane defaults", () => {
    const parsed = weatherConfigSchema.parse({ enabled: true, latitude: 50, longitude: 8 });
    expect(parsed.forecast.enabled).toBe(false);
    expect(parsed.forecast.provider).toBe("open-meteo");
    expect(parsed.forecast.arrays).toEqual([]);
    expect(parsed.forecast.tempCoefficient).toBe(-0.4);
    expect(parsed.forecast.systemLoss).toBe(14);
  });

  test("rejects out-of-range array parameters", () => {
    const arrays = (over: object) => ({
      enabled: true,
      latitude: 50,
      longitude: 8,
      forecast: { enabled: true, arrays: [{ kwp: 10, tilt: 30, azimuth: 0, ...over }] },
    });
    expect(weatherConfigSchema.safeParse(arrays({})).success).toBe(true);
    expect(weatherConfigSchema.safeParse(arrays({ kwp: -1 })).success).toBe(false);
    expect(weatherConfigSchema.safeParse(arrays({ tilt: 91 })).success).toBe(false);
    expect(weatherConfigSchema.safeParse(arrays({ azimuth: 181 })).success).toBe(false);
  });

  test("forecastReady needs weather + enabled forecast + at least one array", () => {
    const on = weatherConfigSchema.parse({
      enabled: true,
      latitude: 50,
      longitude: 8,
      forecast: { enabled: true, arrays: [{ kwp: 10, tilt: 30, azimuth: 0 }] },
    });
    expect(forecastReady(on)).toBe(true);
    expect(forecastReady({ ...on, forecast: { ...on.forecast, arrays: [] } })).toBe(false);
    expect(forecastReady({ ...on, forecast: { ...on.forecast, enabled: false } })).toBe(false);
    expect(forecastReady({ ...on, enabled: false })).toBe(false);
  });
});
