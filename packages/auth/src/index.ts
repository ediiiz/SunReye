import { createDb } from "@ReyeON/db";
import * as schema from "@ReyeON/db/schema/auth";
import { env } from "@ReyeON/env/server";
import { count } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";

export function createAuth() {
  const db = createDb();

  /** Row count of the `user` table — drives first-run admin + closed signup. */
  const userCount = async () => {
    const [row] = await db.select({ n: count() }).from(schema.user);
    return row?.n ?? 0;
  };

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    // Origin allow-list for Better Auth's CSRF/origin check. Mirrors the server
    // CORS policy (apps/server/src/index.ts): production pins to the configured
    // origin; dev also trusts any localhost/127.0.0.1 origin on any port, since
    // the web app may be served on a random port (Vite fallback, VS Code port
    // forwarding). Better Auth glob-matches these patterns per URL segment, so
    // `:*` matches only the port and never crosses into another host (e.g.
    // `localhostfake.com` and cross-origin hosts are still rejected).
    trustedOrigins:
      env.NODE_ENV === "production"
        ? [env.CORS_ORIGIN]
        : [env.CORS_ORIGIN, "*://localhost:*", "*://127.0.0.1:*"],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    databaseHooks: {
      user: {
        create: {
          // First registered account bootstraps the instance admin; everyone
          // else keeps the plugin default ("user").
          before: async (user) => {
            if ((await userCount()) === 0) {
              return { data: { ...user, role: "admin" } };
            }
            return { data: user };
          },
        },
      },
    },
    hooks: {
      // Invite-only after setup: only the first account may self-register. Later
      // accounts are created by an admin via the admin plugin's `/admin/*`
      // endpoints, which don't hit this matcher.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email" && (await userCount()) > 0) {
          throw new APIError("FORBIDDEN", { message: "Registration is closed" });
        }
      }),
    },
    plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
  });
}

export const auth = createAuth();
