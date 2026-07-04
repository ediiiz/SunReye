import { PUBLIC_SERVER_URL } from "$env/static/public";
import { treaty } from "@elysiajs/eden";
import type { App } from "server";

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
export const api = treaty<App>(PUBLIC_SERVER_URL);
