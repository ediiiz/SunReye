import { dev } from "$app/environment";
import { derived, type Readable } from "svelte/store";
import { authClient } from "$lib/auth-client";

/** Spoofed identity used only when running the dev server with no real session. */
const DEV_USER = { id: "dev", name: "Developer", email: "dev@sunreye.local", role: "admin" };

export type AppUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};
export type AppSession = { data: { user: AppUser } | null; isPending: boolean; isDev: boolean };

/**
 * Session source used by the workspace shell + sidebar.
 *
 * In production this is a thin projection of Better Auth's `useSession()`.
 * On the dev server (`vite dev`) an unauthenticated visitor is transparently
 * signed in as {@link DEV_USER} so login can be skipped while iterating.
 * A real session always wins, so logging in during dev still behaves normally.
 */
export function useAppSession(): Readable<AppSession> {
  const real = authClient.useSession();
  return derived(real, ($s): AppSession => {
    if ($s.data) return { data: { user: $s.data.user }, isPending: false, isDev: false };
    if (dev && !$s.isPending) return { data: { user: DEV_USER }, isPending: false, isDev: true };
    return { data: null, isPending: $s.isPending, isDev: false };
  });
}
