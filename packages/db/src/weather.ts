/**
 * Weather preferences — the location the dashboard's weather tile renders for.
 * Stored in `app_settings` under {@link WEATHER_KEY} and validated with
 * {@link weatherConfigSchema} on read/write, mirroring the display/access
 * config pattern. Data comes from Open-Meteo (keyless), proxied by the server.
 */

import { z } from "zod";

/** `app_settings.key` under which the weather config is stored. */
export const WEATHER_KEY = "weather";

export const weatherConfigSchema = z.object({
  /** Enable the weather tile + Open-Meteo fetch. Off until a location is set. */
  enabled: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  /** Friendly place name shown on the tile (e.g. "Limburg-Weilburg"). */
  label: z.string().max(120).default(""),
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
