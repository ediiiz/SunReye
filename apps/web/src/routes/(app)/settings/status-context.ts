import { getContext, setContext } from "svelte";

/**
 * Live connection health shared across settings subroutes. The layout polls
 * `/api/status` once and exposes the latest snapshot through context so the
 * Inverter and MQTT panels can render their badges without each opening their
 * own poll loop.
 */
export type SettingsStatus = {
  inverter: {
    connected: boolean;
    simulate: boolean;
    lastError: string | null;
    lastSampleAt: string | null;
    profile: string;
  };
  mqtt: { enabled: boolean; connected: boolean; lastError: string | null };
} | null;

/** Reactive holder — `current` re-reads the layout's `$state` on access. */
export type SettingsStatusCtx = { readonly current: SettingsStatus };

const KEY = Symbol("settings-status");

export function setSettingsStatus(ctx: SettingsStatusCtx): void {
  setContext(KEY, ctx);
}

export function getSettingsStatus(): SettingsStatusCtx {
  return getContext(KEY);
}
