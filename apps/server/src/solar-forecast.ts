/**
 * PV production forecast for the dashboard's weather tile.
 *
 * Split so new data sources stay cheap to add: a {@link SolarIrradianceProvider}
 * only delivers hourly plane-of-array irradiance + ambient temperature for the
 * plant's location; the PV power model here (orientation-aware arrays, cell
 * temperature derating, static system losses) is provider-agnostic and turns
 * any provider's series into expected AC watts and daily kWh sums. Open-Meteo
 * is the default provider; register additions in {@link PROVIDERS}.
 */

import { type WeatherConfig, forecastReady } from "@SunReye/db/weather";
import { log } from "./logging";
import { openMeteoIrradiance } from "./solar-providers/open-meteo";

const logger = log("solar-forecast");

/** One panel orientation a provider must resolve irradiance for. */
export interface PlaneOfArray {
  /** Panel tilt from horizontal, degrees. */
  tilt: number;
  /** Panel azimuth, degrees (0 = south, -90 = east, 90 = west). */
  azimuth: number;
}

/** What a provider delivers: aligned hourly series for the requested planes. */
export interface IrradianceForecast {
  /** Hour-start timestamps in the plant's local time (`YYYY-MM-DDTHH:mm`). */
  times: string[];
  /** Offset of those local times from UTC, in seconds. */
  utcOffsetSeconds: number;
  /** Ambient 2 m temperature per hour, °C. */
  temperature: number[];
  /** Global tilted irradiance per requested plane, W/m² per hour. */
  gti: number[][];
}

export interface SolarIrradianceProvider {
  readonly id: string;
  fetch(
    location: { latitude: number; longitude: number },
    planes: PlaneOfArray[],
  ): Promise<IrradianceForecast>;
}

/** Registered providers; the config's `forecast.provider` picks one. */
const PROVIDERS: Record<string, SolarIrradianceProvider> = {
  [openMeteoIrradiance.id]: openMeteoIrradiance,
};

export interface SolarForecastHour {
  /** Hour start, plant-local time. */
  time: string;
  /** Expected plant AC output over that hour, W. */
  watts: number;
}

export interface SolarForecast {
  provider: string;
  hourly: SolarForecastHour[];
  /** Expected production for the local calendar day, kWh. */
  todayKwh: number;
  /** Expected production from now to local midnight, kWh (running hour prorated). */
  remainingTodayKwh: number;
  tomorrowKwh: number;
}

// Cell-temperature model (NOCT): cells run ~25 °C above ambient at 800 W/m²,
// scaling linearly with irradiance.
const CELL_TEMP_RISE_PER_WM2 = 25 / 800;
const STC_CELL_TEMP_C = 25;

/**
 * Expected AC power of one array at a given plane-of-array irradiance.
 * DC = kWp scaled by irradiance relative to STC (1000 W/m²), derated by the
 * datasheet temperature coefficient at the estimated cell temperature; AC
 * applies the static system-loss percentage.
 */
export function pvPowerW(
  gtiWm2: number,
  ambientC: number,
  kwp: number,
  tempCoefficientPctPerC: number,
  systemLossPct: number,
): number {
  if (gtiWm2 <= 0) return 0;
  const cellC = ambientC + gtiWm2 * CELL_TEMP_RISE_PER_WM2;
  const derate = 1 + (tempCoefficientPctPerC / 100) * (cellC - STC_CELL_TEMP_C);
  const dcW = kwp * gtiWm2 * Math.max(0, derate); // kwp * 1000 * (gti / 1000)
  return Math.max(0, dcW * (1 - systemLossPct / 100));
}

/**
 * Combine a provider's irradiance series with the plant config into hourly AC
 * watts and daily kWh sums. Pure — `nowMs` is injectable for tests.
 */
export function buildSolarForecast(
  config: WeatherConfig["forecast"],
  data: IrradianceForecast,
  provider: string,
  nowMs = Date.now(),
): SolarForecast {
  const hourly: SolarForecastHour[] = data.times.map((time, i) => {
    let watts = 0;
    config.arrays.forEach((arr, a) => {
      watts += pvPowerW(
        data.gti[a]?.[i] ?? 0,
        data.temperature[i] ?? STC_CELL_TEMP_C,
        arr.kwp,
        config.tempCoefficient,
        config.systemLoss,
      );
    });
    return { time, watts };
  });

  // Bucket by the plant's local calendar day. "Remaining" includes the running
  // hour prorated by the fraction of it still ahead, so an 11:30 view counts
  // half of the 11:00 slot instead of the whole hour.
  const shifted = new Date(nowMs + data.utcOffsetSeconds * 1000);
  const localNow = shifted.toISOString();
  const today = localNow.slice(0, 10);
  const nowHour = localNow.slice(0, 13);
  const hourLeft = 1 - (shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds()) / 3600;
  const tomorrow = new Date(nowMs + data.utcOffsetSeconds * 1000 + 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const kwh = (hours: SolarForecastHour[]) => hours.reduce((s, h) => s + h.watts / 1000, 0);

  return {
    provider,
    hourly,
    todayKwh: kwh(hourly.filter((h) => h.time.startsWith(today))),
    remainingTodayKwh: hourly.reduce((s, h) => {
      if (!h.time.startsWith(today)) return s;
      const hour = h.time.slice(0, 13);
      if (hour < nowHour) return s;
      return s + (h.watts / 1000) * (hour === nowHour ? hourLeft : 1);
    }, 0),
    tomorrowKwh: kwh(hourly.filter((h) => h.time.startsWith(tomorrow))),
  };
}

/** How long fetched irradiance is reused before hitting the provider again. */
const CACHE_TTL_MS = 30 * 60 * 1000;

// The cache holds the provider's raw irradiance, not the finished forecast:
// today/remaining sums depend on "now", so they are rebuilt on every request
// (cheap — 48 hours × arrays) instead of being frozen for the TTL.
let cache: { key: string; at: number; data: IrradianceForecast; provider: string } | null = null;

/**
 * Production forecast for the configured plant, or `null` when the forecast is
 * disabled/unconfigured, the provider is unknown, or the fetch fails with no
 * cached value. A stale cached forecast is preferred over `null` on transient
 * failures, mirroring the weather proxy.
 */
export async function fetchSolarForecast(config: WeatherConfig): Promise<SolarForecast | null> {
  if (!forecastReady(config)) return null;

  const provider = PROVIDERS[config.forecast.provider];
  if (!provider) {
    logger.warn("unknown provider: {provider}", { provider: config.forecast.provider });
    return null;
  }

  const key = JSON.stringify([config.latitude, config.longitude, config.forecast]);
  if (cache !== null && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return buildSolarForecast(config.forecast, cache.data, cache.provider);
  }

  try {
    const data = await provider.fetch(
      { latitude: config.latitude, longitude: config.longitude },
      config.forecast.arrays.map(({ tilt, azimuth }) => ({ tilt, azimuth })),
    );
    cache = { key, at: Date.now(), data, provider: provider.id };
    return buildSolarForecast(config.forecast, data, provider.id);
  } catch (err) {
    logger.warn("fetch failed: {error}", { error: err instanceof Error ? err.message : err });
    return cache?.key === key
      ? buildSolarForecast(config.forecast, cache.data, cache.provider)
      : null;
  }
}
