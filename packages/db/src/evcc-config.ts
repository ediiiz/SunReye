/**
 * EVCC integration config — surfaces an external EVCC instance (EV charger)
 * in the dashboard. Stored in `app_settings` under {@link EVCC_KEY} and
 * validated with {@link evccConfigSchema}, mirroring the weather/mqtt pattern.
 *
 * Deliberately holds **no broker fields**: the connection reuses the broker
 * URL/credentials from the MQTT config (mqtt-config.ts), so there is no new
 * secret to mask. Only the EVCC-specific knobs live here.
 */

import { z } from "zod";
import type { MqttConfig } from "./mqtt-config";

/** `app_settings.key` under which the EVCC config is stored. */
export const EVCC_KEY = "evcc";

export const evccConfigSchema = z.object({
  /** Subscribe to the EVCC topics and show the EV card/node when true. */
  enabled: z.boolean().default(false),
  /** EVCC's MQTT root topic (its `mqtt.topic` setting; default `evcc`). */
  topicRoot: z.string().min(1).max(120).default("evcc"),
});
export type EvccConfig = z.infer<typeof evccConfigSchema>;

export const defaultEvcc: EvccConfig = evccConfigSchema.parse({});

/**
 * Whether the EVCC subscriber can run: enabled and a broker to dial. The
 * broker comes from the shared MQTT config — but deliberately *not* its
 * `enabled` flag, which only governs inverter→MQTT publishing.
 */
export function evccReady(cfg: EvccConfig, mqtt: Pick<MqttConfig, "brokerUrl">): boolean {
  return cfg.enabled && mqtt.brokerUrl.trim().length > 0;
}
