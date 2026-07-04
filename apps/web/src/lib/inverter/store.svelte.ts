import { SvelteMap } from "svelte/reactivity";
import { api } from "$lib/api";
import type {
  CanonicalRole,
  InverterCapabilities,
  InverterManifest,
  LivePoint,
  LiveSample,
  ManifestMetric,
} from "./types";

/** Trailing time window kept per metric for live sparklines. */
const WINDOW_MS = 5 * 60 * 1000;
/** Hard per-metric point cap so a faster-than-1 Hz feed can't grow unbounded. */
const MAX_POINTS = 5000;

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

  // Reactive map: metric key → recent points. Plain `Map` in `$state` is NOT
  // reactive on get/set — SvelteMap tracks per-key mutations so sparklines
  // update the instant a new point lands.
  #series = new SvelteMap<string, LivePoint[]>();
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

  /** Fetch the manifest, backfill live buffers, and open the live stream. Idempotent. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    void this.#init();
  }

  async #init(): Promise<void> {
    await this.#loadManifest();
    // Seed sparklines with the last window of raw samples so they're populated
    // on load, then attach the live stream which appends from here on.
    await this.#backfill();
    this.#connect();
  }

  async #loadManifest(): Promise<void> {
    const { data } = await api.api.profile.get();
    if (data) this.manifest = data as unknown as InverterManifest;
  }

  async #backfill(): Promise<void> {
    // Over-fetch: pull the whole 5-minute buffer across every metric at the
    // endpoint's max row cap. `desc + limit` returns the most-recent rows, so a
    // small cap would only reach back a few seconds under a dense/multi-metric
    // feed and leave the sparkline window unfilled. Downsample-to-1Hz keeps the
    // client cheap regardless of how many rows come back.
    const { data } = await api.api.history.recent.get({
      query: { seconds: WINDOW_MS / 1000, limit: 200000 },
    });
    if (!data) return;
    const byMetric = new Map<string, LivePoint[]>();
    for (const row of data) {
      const points = byMetric.get(row.metric) ?? [];
      points.push({ t: new Date(row.time).getTime(), v: row.value });
      byMetric.set(row.metric, points);
    }
    for (const [key, points] of byMetric) {
      // Rows arrive newest-first; sort ascending and keep the trailing window.
      points.sort((a, b) => a.t - b.t);
      this.#series.set(key, this.#trim(this.#downsampleToHz(points)));
    }
  }

  /**
   * Collapse the backfill to ~1 point/second so it matches the live stream's
   * density. The raw table can hold denser-than-1 Hz rows, which would make a
   * reloaded sparkline look far more compressed than one built live. Points are
   * ascending; keep the last sample in each 1-second bucket.
   */
  #downsampleToHz(points: LivePoint[]): LivePoint[] {
    const out: LivePoint[] = [];
    let bucket = Number.NaN;
    for (const p of points) {
      const b = Math.floor(p.t / 1000);
      if (b === bucket) out[out.length - 1] = p;
      else {
        out.push(p);
        bucket = b;
      }
    }
    return out;
  }

  /** Keep points within the trailing window, bounded by the hard cap. */
  #trim(points: LivePoint[]): LivePoint[] {
    const cutoff = (points.at(-1)?.t ?? 0) - WINDOW_MS;
    const windowed = points.filter((p) => p.t >= cutoff);
    return windowed.length > MAX_POINTS ? windowed.slice(-MAX_POINTS) : windowed;
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
        // New array reference each tick so consumers re-render; trim to window.
        const next = [...(this.#series.get(key) ?? []), { t, v }];
        this.#series.set(key, this.#trim(next));
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
