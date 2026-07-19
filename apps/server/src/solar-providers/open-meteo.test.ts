import {
  type Mock,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { openMeteoIrradiance } from "./open-meteo";

// Never hit the real API: answer fetch() with canned Open-Meteo payloads and
// inspect the requested URLs. The spy is created when this file's tests start
// (not at load) so it can't interleave with another file's fetch spy.
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

const location = { latitude: 50.5, longitude: 8.2 };
const times = ["2026-07-18T08:00", "2026-07-18T09:00"];

/** A well-formed forecast response; nulls exercise the →0 mapping. */
const okBody = (gti: (number | null)[] = [100, null], withTemp = true) => ({
  utc_offset_seconds: 7200,
  hourly: {
    time: times,
    ...(withTemp ? { temperature_2m: [20, null] } : {}),
    global_tilted_irradiance: gti,
  },
});

const respond = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  fetchSpy.mockReset();
});

describe("openMeteoIrradiance", () => {
  test("requests GTI + temperature for one plane and maps nulls to 0", async () => {
    fetchSpy.mockImplementation(() => respond(okBody()));
    const forecast = await openMeteoIrradiance.fetch(location, [{ tilt: 30, azimuth: 0 }]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain("latitude=50.5");
    expect(url).toContain("tilt=30");
    expect(url).toContain("azimuth=0");
    expect(url).toContain("global_tilted_irradiance,temperature_2m");
    expect(url).toContain("forecast_days=2");

    expect(forecast.times).toEqual(times);
    expect(forecast.utcOffsetSeconds).toBe(7200);
    expect(forecast.temperature).toEqual([20, 0]);
    expect(forecast.gti).toEqual([[100, 0]]);
  });

  test("deduplicates identical orientations into one request", async () => {
    fetchSpy.mockImplementation(() => respond(okBody([800, 400])));
    const planes = [
      { tilt: 30, azimuth: 0 },
      { tilt: 30, azimuth: 0 },
    ];
    const forecast = await openMeteoIrradiance.fetch(location, planes);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Both planes get the shared series back.
    expect(forecast.gti).toEqual([
      [800, 400],
      [800, 400],
    ]);
  });

  test("fetches per distinct orientation; temperature rides on the first only", async () => {
    fetchSpy.mockImplementation((input) => {
      const url = String(input);
      // Second request (west plane) omits temperature and answers its own GTI.
      if (url.includes("azimuth=90")) return respond(okBody([50, 25], false));
      return respond(okBody([800, 400]));
    });
    const forecast = await openMeteoIrradiance.fetch(location, [
      { tilt: 30, azimuth: 0 },
      { tilt: 20, azimuth: 90 },
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1]?.[0])).not.toContain("temperature_2m");
    expect(forecast.gti).toEqual([
      [800, 400],
      [50, 25],
    ]);
  });

  test("missing utc_offset_seconds falls back to 0", async () => {
    fetchSpy.mockImplementation(() => {
      const { utc_offset_seconds: _drop, ...rest } = okBody();
      return respond(rest);
    });
    const forecast = await openMeteoIrradiance.fetch(location, [{ tilt: 30, azimuth: 0 }]);
    expect(forecast.utcOffsetSeconds).toBe(0);
  });

  test("rejects on a non-OK HTTP status", async () => {
    fetchSpy.mockImplementation(() => respond({}, 500));
    await expect(openMeteoIrradiance.fetch(location, [{ tilt: 30, azimuth: 0 }])).rejects.toThrow(
      "HTTP 500",
    );
  });

  test("rejects when the hourly time/temperature fields are missing", async () => {
    fetchSpy.mockImplementation(() => respond({ hourly: {} }));
    await expect(openMeteoIrradiance.fetch(location, [{ tilt: 30, azimuth: 0 }])).rejects.toThrow(
      "missing hourly fields",
    );
  });

  test("rejects when a plane's irradiance series is absent or misaligned", async () => {
    fetchSpy.mockImplementation(() => respond(okBody([100]))); // 1 value for 2 hours
    await expect(openMeteoIrradiance.fetch(location, [{ tilt: 30, azimuth: 0 }])).rejects.toThrow(
      "missing irradiance series",
    );
  });
});
