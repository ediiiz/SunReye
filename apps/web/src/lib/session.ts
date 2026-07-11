import { derived, type Readable } from "svelte/store";
import { authClient } from "$lib/auth-client";

export type AppUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};
export type AppSession = { data: { user: AppUser } | null; isPending: boolean };

/**
 * Session source used by the workspace shell + sidebar — a thin projection of
 * Better Auth's `useSession()`. An unauthenticated visitor has `data: null`, so
 * the app-shell gate routes them to `/login` (and on to `/onboarding` when no
 * admin exists yet).
 */
export function useAppSession(): Readable<AppSession> {
  const real = authClient.useSession();
  return derived(real, ($s): AppSession => {
    if ($s.data) return { data: { user: $s.data.user }, isPending: false };
    return { data: null, isPending: $s.isPending };
  });
}
