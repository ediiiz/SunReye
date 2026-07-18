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

/**
 * Whether the instance still needs a first-run **profile** chosen. When true the
 * server booted onboarding-only (no active inverter profile), so the workspace
 * gate routes the admin to `/setup` to pick one, test the connection, and
 * restart into the full API.
 */
async function needsProfile(): Promise<boolean> {
  const { data } = await api.api["profile-status"].get();
  return data?.needsProfile ?? false;
}

/**
 * Whether the admin has enabled the anonymous read-only dashboard. Public, so a
 * logged-out visitor can be shown the dashboard (true) or the login page (false)
 * without a session. Mirrors the server's `publicDashboard` access toggle.
 */
export async function publicDashboardEnabled(): Promise<boolean> {
  const { data } = await api.api["access-status"].get();
  return data?.publicDashboard ?? false;
}

/**
 * Where a first-run instance must go, in strict precedence:
 * - `setup-account` — no admin exists yet → create it at `/onboarding`.
 * - `setup-profile` — admin exists but no active profile → pick one at `/setup`.
 * - `ready` — fully configured → the workspace.
 *
 * The account step wins over the profile step, so the two gates (`/` and
 * `/setup`) never bounce a user into profile setup before an admin exists.
 */
export type FirstRunGate = "setup-account" | "setup-profile" | "ready";

export async function firstRunGate(): Promise<FirstRunGate> {
  if (await needsSetup()) return "setup-account";
  if (await needsProfile()) return "setup-profile";
  return "ready";
}

/** Whether the server has answered again after a restart. */
async function serverIsUp(): Promise<boolean> {
  try {
    const { data } = await api.api["setup-status"].get();
    return data != null;
  } catch {
    return false;
  }
}

/**
 * Ask the server to restart (to apply a boot-time change like a newly activated
 * profile), then poll until it answers again and reload the page. Resolves
 * `false` if it never comes back within {@link timeoutMs} — e.g. run without a
 * supervisor to relaunch it — so the caller can prompt a manual restart. On
 * success the page reloads and the promise never settles.
 */
export async function restartServer(timeoutMs = 30_000): Promise<boolean> {
  const { error } = await api.api.admin.restart.post();
  if (error) return false;
  // Let it actually go down before polling, so we don't see the pre-exit server.
  await new Promise((r) => setTimeout(r, 1200));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverIsUp()) {
      location.reload();
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
