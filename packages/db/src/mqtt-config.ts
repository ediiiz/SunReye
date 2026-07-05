/**
 * MQTT / Home Assistant bridge config — runtime-editable, replacing the env-only
 * settings. Stored in `app_settings` under {@link MQTT_KEY} and validated with
 * {@link mqttConfigSchema}. The password is write-only over the API (masked on
 * read); see the server config service.
 *
 * Shared by the server (runtime controller) and the web app (settings form).
 */

import { z } from "zod";

/** `app_settings.key` under which the MQTT config is stored. */
export const MQTT_KEY = "mqtt";

export const mqttConfigSchema = z.object({
  /** Dial the broker and bridge entities when true; fully off otherwise. */
  enabled: z.boolean().default(false),
  brokerUrl: z.string().min(1).default("mqtt://localhost:1883"),
  username: z.string().optional(),
  password: z.string().optional(),
  /** Root topic segment: `<prefix>/<inverterId>/<topic>`. */
  topicPrefix: z.string().min(1).default("sunreye"),
  /** Publish Home Assistant MQTT Discovery configs (requires `enabled`). */
  haDiscoveryEnabled: z.boolean().default(false),
  haDiscoveryPrefix: z.string().min(1).default("homeassistant"),
});
export type MqttConfig = z.infer<typeof mqttConfigSchema>;

/** API-safe shape: the password is never returned, only whether one is set. */
export type MqttConfigMasked = Omit<MqttConfig, "password"> & { hasPassword: boolean };

export function maskMqttConfig(cfg: MqttConfig): MqttConfigMasked {
  const { password: _password, ...rest } = cfg;
  return { ...rest, hasPassword: Boolean(cfg.password) };
}

/**
 * Merge an API write over the stored config. The password is write-only, so an
 * absent/empty incoming password means "leave the existing one unchanged".
 */
export function mergeMqttWrite(existing: MqttConfig, input: MqttConfig): MqttConfig {
  return { ...input, password: input.password ? input.password : existing.password };
}
