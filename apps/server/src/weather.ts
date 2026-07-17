/**
 * Open-Meteo weather proxy for the dashboard tile. Open-Meteo is keyless and
 * self-host friendly; the SPA can't call it directly (strict CSP behind ingress),
 * so the server fetches, maps the WMO weather code to a coarse condition/icon,
 * and caches briefly to stay well under Open-Meteo's fair-use limits.
 */

import { type WeatherConfig, weatherReady } from "@SunReye/db/weather";
import { log } from "./logging";

const logger = log("weather");

/** How long a fetched reading is reused before hitting Open-Meteo again. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Coarse condition buckets the web maps to an icon. */
export type WeatherIcon =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

export interface WeatherReading {
  temperature: number;
  unit: string;
  /** WMO weather interpretation code. */
  code: number;
  condition: string;
  icon: WeatherIcon;
  /** Today's shortwave radiation sum (MJ/m²), a light "solar forecast" figure. */
  solarRadiationSum: number | null;
  label: string;
}

/** WMO weather interpretation code → coarse condition + icon bucket. */
function interpret(code: number): { condition: string; icon: WeatherIcon } {
  if (code === 0) return { condition: "Clear sky", icon: "clear" };
  if (code === 1) return { condition: "Mainly clear", icon: "clear" };
  if (code === 2) return { condition: "Partly cloudy", icon: "partly-cloudy" };
  if (code === 3) return { condition: "Overcast", icon: "cloudy" };
  if (code === 45 || code === 48) return { condition: "Fog", icon: "fog" };
  if (code >= 51 && code <= 57) return { condition: "Drizzle", icon: "drizzle" };
  if (code >= 61 && code <= 67) return { condition: "Rain", icon: "rain" };
  if (code >= 71 && code <= 77) return { condition: "Snow", icon: "snow" };
  if (code >= 80 && code <= 82) return { condition: "Rain showers", icon: "rain" };
  if (code === 85 || code === 86) return { condition: "Snow showers", icon: "snow" };
  if (code >= 95) return { condition: "Thunderstorm", icon: "thunder" };
  return { condition: "Unknown", icon: "cloudy" };
}

interface OpenMeteoResponse {
  current?: { temperature_2m?: number; weather_code?: number };
  current_units?: { temperature_2m?: string };
  daily?: { shortwave_radiation_sum?: (number | null)[] };
}

let cache: { key: string; at: number; reading: WeatherReading } | null = null;

/**
 * Current weather for the configured location, or `null` when weather is
 * disabled/unconfigured or the upstream call fails with no cached value. A stale
 * cached reading is preferred over `null` on a transient fetch failure.
 */
export async function fetchWeather(config: WeatherConfig): Promise<WeatherReading | null> {
  if (!weatherReady(config)) return null;

  const key = `${config.latitude},${config.longitude}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.reading;
  }

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${config.latitude}&longitude=${config.longitude}` +
    "&current=temperature_2m,weather_code&daily=shortwave_radiation_sum" +
    "&timezone=auto&forecast_days=1";

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as OpenMeteoResponse;
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (temp === undefined || code === undefined) throw new Error("missing current fields");

    const { condition, icon } = interpret(code);
    const reading: WeatherReading = {
      temperature: temp,
      unit: data.current_units?.temperature_2m ?? "°C",
      code,
      condition,
      icon,
      solarRadiationSum: data.daily?.shortwave_radiation_sum?.[0] ?? null,
      label: config.label,
    };
    cache = { key, at: Date.now(), reading };
    return reading;
  } catch (err) {
    logger.warn("fetch failed: {error}", { error: err instanceof Error ? err.message : err });
    // Serve a stale reading for the same location if we have one.
    return cache && cache.key === key ? cache.reading : null;
  }
}
