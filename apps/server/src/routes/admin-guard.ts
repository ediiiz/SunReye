import { auth } from "@SunReye/auth";
import { Elysia } from "elysia";

// Admin gate for privileged mutations (config + live inverter writes). Opt in
// per route with `{ requireAdmin: true }`. Reads stay public. Every environment
// enforces a real admin session — no dev bypass — so unauthenticated callers
// can never mutate settings, activate profiles, or restart the process. Named
// plugin: deduped when several route modules `.use()` it, and the macro
// propagates to every consumer.
export const adminGuard = new Elysia({ name: "admin-guard" }).macro({
  requireAdmin(enabled: boolean) {
    if (!enabled) return {};
    return {
      async beforeHandle({ request, status }) {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return status(401, { error: "Authentication required" });
        if (session.user.role !== "admin") {
          return status(403, { error: "Admin access required" });
        }
      },
    };
  },
});
