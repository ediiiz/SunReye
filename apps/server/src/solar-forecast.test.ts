import { type Mock, afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { solarForecastConfigSchema, weatherConfigSchema } from "@SunReye/db/weather";
import {
  type IrradianceForecast,
  buildSolarForecast,
  fetchSolarForecast,
  pvPowerW,
} from "./solar-forecast";

const config = (over: object = {}) =>
  solarForecastConfigSchema.parse({
    enabled: true,
    arrays: [{ kwp: 10, tilt: 30, azimuth: 0 }],
    tempCoefficient: -0.4,
    systemLoss: 14,
    ...over,
  });

describe("pvPowerW", () => {
  test("zero at night and never negative", () => {
    expect(pvPowerW(0, 15, 10, -0.4, 14)).toBe(0);
    expect(pvPowerW(-5, 15, 10, -0.4, 14)).toBe(0);
  });

  test("STC-ish conditions yield roughly kWp minus losses", () => {
    // 1000 W/m² with cells at exactly 25 °C (ambient 25 - rise 31.25 ≈ -6.25).
    const w = pvPowerW(1000, 25 - (1000 * 25) / 800, 10, -0.4, 14);
    expect(w).toBeCloseTo(10 * 1000 * 0.86, 0);
  });

  test("hot cells produce less than cool cells at equal irradiance", () => {
    const cool = pvPowerW(800, 5, 10, -0.4, 14);
    const hot = pvPowerW(800, 35, 10, -0.4, 14);
    expect(hot).toBeLessThan(cool);
  });

  test("temperature coefficient of zero disables derating", () => {
    const w = pvPowerW(500, 40, 10, 0, 0);
    expect(w).toBeCloseTo(5000, 5);
  });
});

describe("buildSolarForecast", () => {
  // Two local days, one sunny hour each; local time = UTC+2.
  const data: IrradianceForecast = {
    times: ["2026-07-18T08:00", "2026-07-18T12:00", "2026-07-19T12:00"],
    utcOffsetSeconds: 7200,
    temperature: [20, 25, 25],
    gti: [[100, 800, 400]],
  };
  // Local noon on the 18th → 10:00 UTC.
  const nowMs = Date.parse("2026-07-18T10:00:00Z");

  test("buckets kWh into today / remaining / tomorrow by local day", () => {
    const f = buildSolarForecast(config(), data, "test", nowMs);
    expect(f.provider).toBe("test");
    expect(f.hourly).toHaveLength(3);
    expect(f.todayKwh).toBeGreaterThan(f.remainingTodayKwh);
    // Remaining keeps the running hour: only the 12:00 slot counts.
    expect(f.remainingTodayKwh).toBeCloseTo((f.hourly[1]?.watts ?? -1) / 1000, 6);
    expect(f.tomorrowKwh).toBeCloseTo((f.hourly[2]?.watts ?? -1) / 1000, 6);
  });

  test("prorates the running hour by the fraction still ahead", () => {
    // Local 12:30 → half of the 12:00 slot remains.
    const f = buildSolarForecast(config(), data, "test", Date.parse("2026-07-18T10:30:00Z"));
    expect(f.remainingTodayKwh).toBeCloseTo(((f.hourly[1]?.watts ?? -1) / 1000) * 0.5, 6);
  });

  test("sums power across multiple arrays with their own orientation series", () => {
    const two = config({
      arrays: [
        { kwp: 5, tilt: 30, azimuth: -45 },
        { kwp: 5, tilt: 30, azimuth: 45 },
      ],
    });
    const twoPlanes: IrradianceForecast = {
      ...data,
      gti: [
        [100, 800, 400],
        [50, 400, 200],
      ],
    };
    const f = buildSolarForecast(two, twoPlanes, "test", nowMs);
    const single = buildSolarForecast(
      config({ arrays: [{ kwp: 5, tilt: 30, azimuth: -45 }] }),
      data,
      "test",
      nowMs,
    );
    expect(f.hourly[1]?.watts ?? 0).toBeGreaterThan(single.hourly[1]?.watts ?? Infinity);
  });

  test("missing gti entries count as zero rather than crashing", () => {
    const sparse: IrradianceForecast = { ...data, gti: [] };
    const f = buildSolarForecast(config(), sparse, "test", nowMs);
    expect(f.todayKwh).toBe(0);
  });
});

describe("fetchSolarForecast", () => {
  // The default provider (open-meteo) reaches the network through global
  // fetch; answer it with canned payloads instead. The spy is created when the
  // block's tests start (not at load) so it can't interleave with another
  // file's fetch spy.
  // Typed against the plain call signature: Bun's `typeof fetch` also carries
  // `preconnect`, which canned-response test doubles have no reason to provide.
  type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  let fetchSpy: Mock<FetchLike>;

  beforeAll(() => {
    fetchSpy = spyOn(globalThis, "fetch") as unknown as Mock<FetchLike>;
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  const weather = (latitude: number, over: object = {}) =>
    weatherConfigSchema.parse({
      enabled: true,
      latitude,
      longitude: 8.2,
      label: "Test",
      forecast: {
        enabled: true,
        provider: "open-meteo",
        arrays: [{ kwp: 10, tilt: 30, azimuth: 0 }],
        tempCoefficient: -0.4,
        systemLoss: 14,
        ...over,
      },
    });

  // Hours on the plant-local *current* day (same offset math as the code under
  // test), so todayKwh actually buckets them as today.
  const localToday = new Date(Date.now() + 7200 * 1000).toISOString().slice(0, 10);
  const okBody = {
    utc_offset_seconds: 7200,
    hourly: {
      time: [`${localToday}T08:00`, `${localToday}T12:00`],
      temperature_2m: [20, 25],
      global_tilted_irradiance: [100, 800],
    },
  };
  const respondOk = () => Promise.resolve(new Response(JSON.stringify(okBody)));

  test("returns null (without fetching) when the forecast is not configured", async () => {
    fetchSpy.mockClear();
    await expect(fetchSolarForecast(weatherConfigSchema.parse({}))).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("returns null for an unknown provider", async () => {
    await expect(fetchSolarForecast(weather(48, { provider: "nope" }))).resolves.toBeNull();
  });

  test("returns null when the fetch fails and nothing is cached for the key", async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error("offline")));
    await expect(fetchSolarForecast(weather(51))).resolves.toBeNull();
  });

  test("builds the forecast from the provider's irradiance", async () => {
    fetchSpy.mockImplementation(respondOk);
    const forecast = await fetchSolarForecast(weather(50.5));
    expect(forecast?.provider).toBe("open-meteo");
    expect(forecast?.hourly).toHaveLength(2);
    expect(forecast?.todayKwh).toBeGreaterThan(0);
  });

  test("serves repeat calls from the cache within the TTL", async () => {
    fetchSpy.mockClear();
    fetchSpy.mockImplementation(() => Promise.reject(new Error("must not fetch")));
    const forecast = await fetchSolarForecast(weather(50.5));
    expect(forecast?.provider).toBe("open-meteo");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("prefers the stale cache over null when a refresh fails after the TTL", async () => {
    fetchSpy.mockClear();
    fetchSpy.mockImplementation(() => Promise.reject(new Error("offline")));
    const nowSpy = spyOn(Date, "now");
    nowSpy.mockReturnValue(Date.now() + 31 * 60 * 1000); // past the 30 min TTL
    try {
      const forecast = await fetchSolarForecast(weather(50.5));
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(forecast?.provider).toBe("open-meteo");
      expect(forecast?.hourly).toHaveLength(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
