/**
 * LogTape wiring for the server. `setupLogging()` must run (and be awaited)
 * before anything logs — Elysia's request logger and every app logger below
 * flow through the sinks configured here.
 *
 * Category tree:
 *   ["server", ...]  — app logs (mqtt, runtime, api)
 *   ["elysia"]       — HTTP request logs from `@logtape/elysia`
 */

import { env } from "@SunReye/env/server";
import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
  getLogger,
  type LogLevel,
} from "@logtape/logtape";

/** Root category for all application (non-HTTP) logs. */
const ROOT = "server" as const;

/**
 * Lowest severity that reaches the console. Explicit `LOG_LEVEL` wins; otherwise
 * verbose in development, quiet elsewhere.
 */
const lowestLevel: LogLevel =
  env.LOG_LEVEL ?? (env.NODE_ENV === "development" ? "debug" : "info");

let configured = false;

/** Configure LogTape's sinks and loggers. Idempotent. */
export async function setupLogging(): Promise<void> {
  if (configured) return;
  configured = true;
  await configure({
    reset: true,
    sinks: {
      // Colorized, human-readable output in dev; plain in prod so log
      // shippers/journald get clean lines.
      console: getConsoleSink({
        formatter: env.NODE_ENV === "development" ? ansiColorFormatter : undefined,
      }),
    },
    loggers: [
      { category: [ROOT], sinks: ["console"], lowestLevel },
      { category: ["elysia"], sinks: ["console"], lowestLevel },
      // Silence LogTape's own meta warnings below "warning".
      { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
    ],
  });
}

/** App logger under the shared root, e.g. `log("mqtt")` → ["server", "mqtt"]. */
export function log(...subcategory: string[]) {
  return getLogger([ROOT, ...subcategory]);
}
