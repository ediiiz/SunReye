import { describe, expect, test } from "bun:test";

import { defaultWeather, weatherConfigSchema, weatherReady } from "./weather";

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
    expect(weatherReady(defaultWeather)).toBe(false);
    expect(weatherReady({ enabled: true, latitude: 50, longitude: null, label: "" })).toBe(false);
    expect(weatherReady({ enabled: false, latitude: 50, longitude: 8, label: "" })).toBe(false);
    expect(weatherReady({ enabled: true, latitude: 50, longitude: 8, label: "x" })).toBe(true);
  });
});
