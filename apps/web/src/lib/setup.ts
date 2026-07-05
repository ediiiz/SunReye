import { api } from "$lib/api";

/**
 * Whether the instance still needs first-run setup (no accounts yet). Drives the
 * onboarding gate: the first visitor creates the admin, after which registration
 * is closed and `/onboarding` bounces to `/login`.
 */
export async function needsSetup(): Promise<boolean> {
  const { data } = await api.api["setup-status"].get();
  return data?.needsSetup ?? false;
}
