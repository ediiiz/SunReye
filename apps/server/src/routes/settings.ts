import { inverterConfigSchema } from "@SunReye/db/inverter-config";
import { maskMqttConfig } from "@SunReye/db/mqtt-config";
import { Elysia, t } from "elysia";
import {
  getInverterConfig,
  getMqttConfig,
  mergeMqttConfig,
  setInverterConfig,
  setMqttConfig,
} from "../config";
import { getAccess, setAccess } from "../access-settings";
import { getDisplay, setDisplay } from "../display-settings";
import * as runtime from "../runtime";
import { getTariff, setTariff } from "../settings";
import { fetchSolarForecast } from "../solar-forecast";
import { getUiPrefs, setUiPrefs } from "../ui-prefs-settings";
import { fetchWeather } from "../weather";
import { getWeatherConfig, setWeatherConfig } from "../weather-settings";
import { adminGuard } from "./admin-guard";

// Runtime configuration (tariff, inverter, MQTT), editable from the UI. Saving
// persists and hot-applies via the runtime controller; no restart needed.
export const settingsRoutes = new Elysia({ name: "settings-routes" })
  .use(adminGuard)
  // Tariff config for the web app: read the active economic model, or replace
  // it. The body is validated by the shared Zod schema (setTariff), so a bad
  // payload becomes a 400 rather than a 500.
  .get("/api/settings/tariff", () => getTariff(), { requireAdmin: true })
  .put(
    "/api/settings/tariff",
    async ({ body, status }) => {
      try {
        return await setTariff(body);
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid tariff" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  // Display preferences (clock format + time zone) for the web app. A shared,
  // instance-wide render setting the dashboard needs to format timestamps, so it
  // rides the dashboard read policy (session, or anonymous when the public
  // dashboard is on); only admins write.
  .get("/api/settings/display", () => getDisplay(), { requireSession: true })
  .put(
    "/api/settings/display",
    async ({ body, status }) => {
      try {
        return await setDisplay(body);
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid display" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  // Dashboard visibility preferences (which metrics/groups are hidden). Rides
  // the dashboard read policy so the kiosk/public view filters the same way;
  // only admins write. Hidden metrics stay polled, stored, and published to
  // MQTT / the public API — this only affects what the web app renders.
  .get("/api/settings/ui", () => getUiPrefs(), { requireSession: true })
  .put(
    "/api/settings/ui",
    async ({ body, status }) => {
      try {
        return await setUiPrefs(body);
      } catch (error) {
        return status(400, {
          error: error instanceof Error ? error.message : "Invalid preferences",
        });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  .get("/api/settings/inverter", () => getInverterConfig(), { requireAdmin: true })
  .put(
    "/api/settings/inverter",
    async ({ body, status }) => {
      try {
        const config = await setInverterConfig(body);
        await runtime.applyInverterConfig(config);
        return config;
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid config" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  // Test a connection against a *chosen* profile (onboarding passes the profile
  // being set up; the settings page omits it and falls back to the active one).
  // `profileId` rides alongside the connection config — the config schema strips
  // it, so it's read from the raw body first.
  .post(
    "/api/settings/inverter/test",
    async ({ body, status }) => {
      try {
        const raw = body as { profileId?: unknown };
        const profileId = typeof raw?.profileId === "string" ? raw.profileId : null;
        return await runtime.testInverter(profileId, inverterConfigSchema.parse(body));
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid config" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  // MQTT config: the password is masked on read and preserved on write when the
  // client omits it (write-only secret).
  .get("/api/settings/mqtt", async () => maskMqttConfig(await getMqttConfig()), {
    requireAdmin: true,
  })
  .put(
    "/api/settings/mqtt",
    async ({ body, status }) => {
      try {
        const config = await setMqttConfig(body);
        await runtime.applyMqttConfig(config);
        return maskMqttConfig(config);
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid config" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  .post(
    "/api/settings/mqtt/test",
    async ({ body, status }) => {
      try {
        return await runtime.testMqtt(await mergeMqttConfig(body));
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid config" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  // Live connection health (inverter + MQTT) for the settings dashboard.
  .get("/api/status", () => runtime.status(), { requireAdmin: true })
  // Access config: the public read-only dashboard toggle. Admin-only both ways —
  // reads expose the security posture, writes change who can view the dashboard.
  .get("/api/settings/access", () => getAccess(), { requireAdmin: true })
  .put(
    "/api/settings/access",
    async ({ body, status }) => {
      try {
        return await setAccess(body);
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid access" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  // Weather config (location for the dashboard tile) — admin read + write.
  .get("/api/settings/weather", () => getWeatherConfig(), { requireAdmin: true })
  .put(
    "/api/settings/weather",
    async ({ body, status }) => {
      try {
        return await setWeatherConfig(body);
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid weather" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  // Current weather for the configured location (Open-Meteo, server-proxied +
  // cached), plus the PV production forecast when configured. Rides the
  // dashboard read policy so the kiosk view shows it too; `null` when weather
  // is disabled/unconfigured or the upstream is unavailable.
  .get(
    "/api/weather",
    async () => {
      const config = await getWeatherConfig();
      const [reading, forecast] = await Promise.all([
        fetchWeather(config),
        fetchSolarForecast(config),
      ]);
      return reading ? { ...reading, forecast } : null;
    },
    { requireSession: true },
  );
