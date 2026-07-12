import { treaty } from "@elysiajs/eden";
import type { App } from "server";
import { serverUrl } from "./server-url";

/**
 * End-to-end type-safe client for the ElysiaJS core engine.
 *
 * HTTP:  await api.api.history.get({ query: { hours: 24, limit: 5000 } })
 *        await api.api.commands.setting.post({ key, value })
 *
 * WebSocket (live metrics):
 *        const ws = api.ws.metrics.subscribe()
 *        ws.subscribe((msg) => { console.log(msg.data) })
 */
export const api = treaty<App>(serverUrl, {
  // Send the Better Auth session cookie so the server can enforce admin-only
  // mutations (see the `requireAdmin` macro in apps/server/src/index.ts).
  fetch: { credentials: "include" },
  // Eden's date auto-coercion turns any `YYYY-MM-DD`-shaped string in a JSON
  // response into a Date object, silently breaking string period keys (e.g.
  // the cost/energy series `bucket` fields). Keep responses as-typed; callers
  // that want Dates parse explicitly.
  parseDate: false,
});
