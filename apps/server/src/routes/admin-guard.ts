import { auth } from "@SunReye/auth";
import { env } from "@SunReye/env/server";
import { Elysia } from "elysia";

// Admin gate for privileged mutations (config + live inverter writes). Opt in
// per route with `{ requireAdmin: true }`. Reads stay public. A real session
// always decides the outcome; only an *unauthenticated* dev request is waved
// through, mirroring the client dev-spoof in apps/web/src/lib/session.ts so
// `vite dev` can edit settings without logging in. Production always enforces.
// Named plugin: deduped when several route modules `.use()` it, and the macro
// propagates to every consumer.
export const adminGuard = new Elysia({ name: "admin-guard" }).macro({
  requireAdmin(enabled: boolean) {
    if (!enabled) return {};
    return {
      async beforeHandle({ request, status }) {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          if (env.NODE_ENV !== "production") return;
          return status(401, { error: "Authentication required" });
        }
        if (session.user.role !== "admin") {
          return status(403, { error: "Admin access required" });
        }
      },
    };
  },
});
