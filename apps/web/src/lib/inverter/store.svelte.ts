import { api } from "$lib/api";
import type {
  CanonicalRole,
  InverterCapabilities,
  InverterManifest,
  LivePoint,
  LiveSample,
  ManifestMetric,
} from "./types";

/** Points kept per metric for live sparklines (~5 min at 1 Hz). */
const BUFFER = 300;

type Status = "idle" | "connecting" | "live" | "closed";

/**
 * Single source of truth for the active inverter on the client. Holds the
 * capability manifest (fetched once) and the live sample stream, plus small
 * per-metric ring buffers so KPI cards can draw live sparklines. Everything the
 * UI renders is keyed off `manifest` — no vendor-specific code lives here.
 */
class InverterStore {
  manifest = $state<InverterManifest | null>(null);
  latest = $state<LiveSample | null>(null);
  status = $state<Status>("idle");

  // Reactive map: metric key → recent points. Svelte 5 proxies Map mutations.
  #series = $state(new Map<string, LivePoint[]>());
  #ws: { close: () => void } | null = null;
  #started = false;

  get capabilities(): InverterCapabilities | null {
    return this.manifest?.capabilities ?? null;
  }

  get metrics(): ManifestMetric[] {
    return this.manifest?.metrics ?? [];
  }

  /** Latest live value for a metric key, if streamed yet. */
  value(key: string): number | undefined {
    return this.latest?.metrics[key];
  }

  /** Recent live points for a metric key (for sparklines). */
  series(key: string): LivePoint[] {
    return this.#series.get(key) ?? [];
  }

  /** First metric mapped to a canonical role (optionally at a 1-based index). */
  byRole(role: CanonicalRole, index?: number): ManifestMetric | undefined {
    return this.metrics.find((m) => m.role === role && (index === undefined || m.index === index));
  }

  /** All metrics mapped to a role, ordered by index. */
  allByRole(role: CanonicalRole): ManifestMetric[] {
    return this.metrics
      .filter((m) => m.role === role)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }

  /** Metrics in a profile group (inverter, battery, settings, ...). */
  inGroup(group: string): ManifestMetric[] {
    return this.metrics.filter((m) => m.group === group);
  }

  /** Fetch the manifest and open the live stream. Idempotent. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    void this.#loadManifest();
    this.#connect();
  }

  async #loadManifest(): Promise<void> {
    const { data } = await api.api.profile.get();
    if (data) this.manifest = data as unknown as InverterManifest;
  }

  #connect(): void {
    this.status = "connecting";
    const ws = api.ws.metrics.subscribe();
    ws.subscribe((message: { data: unknown }) => {
      const sample = message.data as LiveSample;
      this.latest = sample;
      this.status = "live";
      const t = new Date(sample.time).getTime();
      for (const [key, v] of Object.entries(sample.metrics)) {
        const prev = this.#series.get(key) ?? [];
        // New array reference each tick so consumers re-render.
        const next = prev.length >= BUFFER ? prev.slice(prev.length - BUFFER + 1) : prev.slice();
        next.push({ t, v });
        this.#series.set(key, next);
      }
    });
    this.#ws = ws;
  }

  /** Close the stream (call on shell teardown). */
  stop(): void {
    this.#ws?.close();
    this.#ws = null;
    this.#started = false;
    this.status = "closed";
  }
}

export const inverter = new InverterStore();
