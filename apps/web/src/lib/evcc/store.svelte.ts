import type { EvccLoadpoint, EvccState } from "server/src/evcc";
import { api } from "$lib/api";
import * as m from "$lib/paraglide/messages";

export type { EvccLoadpoint };

export type EvccMode = "off" | "pv" | "minpv" | "now";

/** EVCC charge modes with their display labels, in EVCC's own UI order. */
export const EVCC_MODES: { value: EvccMode; label: () => string }[] = [
  { value: "off", label: m.evcc_mode_off },
  { value: "pv", label: m.evcc_mode_pv },
  { value: "minpv", label: m.evcc_mode_minpv },
  { value: "now", label: m.evcc_mode_now },
];

/** How often the dashboard refreshes the server-held EVCC snapshot. The server
 * gets push updates over MQTT, so this only bounds UI staleness. */
const POLL_MS = 5000;
/** EVCC applies a command and republishes state within ~2 s; refresh then. */
const COMMAND_ECHO_MS = 2000;

/**
 * Server-held EVCC state on the client. Poll-based (`GET /api/evcc`): the
 * MQTT push freshness lives server-side, the web just re-reads the snapshot.
 * Consumers (power-flow diagram, EV card) each hold a {@link connect} lease
 * from an `$effect`; polling runs while at least one lease is live and pauses
 * in hidden tabs.
 */
class EvccStore {
  state = $state<EvccState | null>(null);
  /** True once the first response has arrived (distinguishes "loading" from "off"). */
  loaded = $state(false);

  #leases = 0;
  #timer: ReturnType<typeof setInterval> | null = null;

  /** Integration on + EVCC publishing + at least one loadpoint to show. */
  get active(): boolean {
    const s = this.state;
    return s !== null && s.reachable && s.loadpoints.length > 0;
  }

  get loadpoints(): EvccLoadpoint[] {
    return this.state?.loadpoints ?? [];
  }

  /** Total charge power across loadpoints (W) — the diagram's charger node. */
  get chargePower(): number {
    return this.loadpoints.reduce((sum, lp) => sum + lp.chargePower, 0);
  }

  async refresh(): Promise<void> {
    const { data, error } = await api.api.evcc.get();
    if (error) return; // Transient fetch problem: keep the last snapshot.
    this.state = (data as EvccState | null) ?? null;
    this.loaded = true;
  }

  /**
   * Lease the poll loop from a component `$effect`; returns the cleanup. The
   * loop starts with the first lease and stops with the last, so any number of
   * consumers share one interval.
   */
  connect(): () => void {
    if (this.#leases++ === 0) {
      void this.refresh();
      this.#timer = setInterval(() => {
        if (!document.hidden) void this.refresh();
      }, POLL_MS);
    }
    return () => {
      if (--this.#leases === 0 && this.#timer) {
        clearInterval(this.#timer);
        this.#timer = null;
      }
    };
  }

  /** Send a loadpoint command; state converges via EVCC's republish. */
  async #command(
    body:
      | { loadpoint: number; action: "mode"; value: EvccMode }
      | { loadpoint: number; action: "limitSoc"; value: number },
  ): Promise<string | null> {
    const { error } = await api.api.commands.evcc.post(body);
    if (error) {
      const detail = error.value as { error?: string } | null;
      return detail?.error ?? `Command failed (${error.status})`;
    }
    setTimeout(() => void this.refresh(), COMMAND_ECHO_MS);
    return null;
  }

  setMode(loadpoint: number, mode: EvccMode): Promise<string | null> {
    return this.#command({ loadpoint, action: "mode", value: mode });
  }

  setLimitSoc(loadpoint: number, limit: number): Promise<string | null> {
    return this.#command({ loadpoint, action: "limitSoc", value: limit });
  }
}

export const evcc = new EvccStore();
