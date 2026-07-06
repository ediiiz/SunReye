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
import * as runtime from "../runtime";
import { getTariff, setTariff } from "../settings";
import { adminGuard } from "./admin-guard";

// Runtime configuration (tariff, inverter, MQTT), editable from the UI. Saving
// persists and hot-applies via the runtime controller; no restart needed.
export const settingsRoutes = new Elysia({ name: "settings-routes" })
  .use(adminGuard)
  // Tariff config for the web app: read the active economic model, or replace
  // it. The body is validated by the shared Zod schema (setTariff), so a bad
  // payload becomes a 400 rather than a 500.
  .get("/api/settings/tariff", () => getTariff())
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
  .get("/api/settings/inverter", () => getInverterConfig())
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
  .post(
    "/api/settings/inverter/test",
    async ({ body, status }) => {
      try {
        return await runtime.testInverter(inverterConfigSchema.parse(body));
      } catch (error) {
        return status(400, { error: error instanceof Error ? error.message : "Invalid config" });
      }
    },
    { requireAdmin: true, body: t.Unknown() },
  )
  // MQTT config: the password is masked on read and preserved on write when the
  // client omits it (write-only secret).
  .get("/api/settings/mqtt", async () => maskMqttConfig(await getMqttConfig()))
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
  .get("/api/status", () => runtime.status());
