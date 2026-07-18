/**
 * Weather preferences — the location the dashboard's weather tile renders for.
 * Stored in `app_settings` under {@link WEATHER_KEY} and validated with
 * {@link weatherConfigSchema} on read/write, mirroring the display/access
 * config pattern. Data comes from Open-Meteo (keyless), proxied by the server.
 */

import { z } from "zod";

/** `app_settings.key` under which the weather config is stored. */
export const WEATHER_KEY = "weather";

/**
 * One PV array (a group of panels sharing an orientation). Plants with strings
 * facing different directions add one entry per orientation.
 */
export const pvArraySchema = z.object({
  /** Peak DC power of this array in kWp. */
  kwp: z.number().positive().max(100_000),
  /** Panel tilt from horizontal in degrees (0 = flat, 90 = vertical). */
  tilt: z.number().min(0).max(90),
  /**
   * Panel azimuth in degrees, Open-Meteo/PV convention:
   * 0 = south, -90 = east, 90 = west, ±180 = north.
   */
  azimuth: z.number().min(-180).max(180),
});
export type PvArray = z.infer<typeof pvArraySchema>;

/** Production-forecast settings for the plant (provider-agnostic PV model). */
export const solarForecastConfigSchema = z.object({
  /** Enable the production forecast on the weather tile. */
  enabled: z.boolean().default(false),
  /** Irradiance data source; must match a provider registered in the server. */
  provider: z.string().default("open-meteo"),
  arrays: z.array(pvArraySchema).max(8).default([]),
  /**
   * Power temperature coefficient of Pmax in %/°C (from the panel datasheet,
   * negative — output drops as cells heat up). Typical mono-Si: -0.30 … -0.45.
   */
  tempCoefficient: z.number().min(-2).max(0).default(-0.4),
  /**
   * Static system losses in % (inverter conversion, wiring, soiling, mismatch).
   * PVWatts' default assumption is 14.
   */
  systemLoss: z.number().min(0).max(90).default(14),
});
export type SolarForecastConfig = z.infer<typeof solarForecastConfigSchema>;

export const weatherConfigSchema = z.object({
  /** Enable the weather tile + Open-Meteo fetch. Off until a location is set. */
  enabled: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  /** Friendly place name shown on the tile (e.g. "Limburg-Weilburg"). */
  label: z.string().max(120).default(""),
  forecast: solarForecastConfigSchema.default(solarForecastConfigSchema.parse({})),
});
export type WeatherConfig = z.infer<typeof weatherConfigSchema>;

export const defaultWeather: WeatherConfig = weatherConfigSchema.parse({});

/** Whether the config has everything needed to fetch (enabled + coordinates). */
export function weatherReady(c: WeatherConfig): c is WeatherConfig & {
  latitude: number;
  longitude: number;
} {
  return c.enabled && c.latitude !== null && c.longitude !== null;
}

/** Whether the production forecast should run (weather on + arrays configured). */
export function forecastReady(c: WeatherConfig): c is WeatherConfig & {
  latitude: number;
  longitude: number;
} {
  return weatherReady(c) && c.forecast.enabled && c.forecast.arrays.length > 0;
}
