/**
 * Open-Meteo irradiance provider for the solar production forecast. Keyless
 * and self-host friendly, like the weather proxy. Open-Meteo computes global
 * tilted irradiance (GTI) server-side, but only for one plane per request —
 * so each distinct panel orientation costs one call; identical orientations
 * are deduplicated. Ambient temperature rides along on the first request.
 */

import type { IrradianceForecast, PlaneOfArray, SolarIrradianceProvider } from "../solar-forecast";

interface OpenMeteoHourly {
  time?: string[];
  temperature_2m?: (number | null)[];
  global_tilted_irradiance?: (number | null)[];
}

interface OpenMeteoResponse {
  utc_offset_seconds?: number;
  hourly?: OpenMeteoHourly;
}

const BASE = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 8000;

async function fetchPlane(
  location: { latitude: number; longitude: number },
  plane: PlaneOfArray,
  withTemperature: boolean,
): Promise<OpenMeteoResponse> {
  const vars = withTemperature
    ? "global_tilted_irradiance,temperature_2m"
    : "global_tilted_irradiance";
  const url =
    `${BASE}?latitude=${location.latitude}&longitude=${location.longitude}` +
    `&hourly=${vars}&tilt=${plane.tilt}&azimuth=${plane.azimuth}` +
    "&timezone=auto&forecast_days=2";
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as OpenMeteoResponse;
}

export const openMeteoIrradiance: SolarIrradianceProvider = {
  id: "open-meteo",

  async fetch(location, planes): Promise<IrradianceForecast> {
    // One request per distinct orientation; planes that share one reuse it.
    const unique = new Map<string, PlaneOfArray>();
    for (const p of planes) unique.set(`${p.tilt}/${p.azimuth}`, p);
    const entries = [...unique.entries()];
    const responses = await Promise.all(
      entries.map(([, plane], i) => fetchPlane(location, plane, i === 0)),
    );

    const first = responses[0]?.hourly;
    const times = first?.time;
    if (!times || !first.temperature_2m) throw new Error("missing hourly fields");
    const byKey = new Map(entries.map(([key], i) => [key, responses[i]]));

    return {
      times,
      utcOffsetSeconds: responses[0]?.utc_offset_seconds ?? 0,
      temperature: first.temperature_2m.map((t) => t ?? 0),
      gti: planes.map((p) => {
        const series = byKey.get(`${p.tilt}/${p.azimuth}`)?.hourly?.global_tilted_irradiance;
        if (!series || series.length !== times.length) {
          throw new Error("missing irradiance series");
        }
        return series.map((v) => v ?? 0);
      }),
    };
  },
};
