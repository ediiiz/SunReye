import { browser } from "$app/environment";
import type { Pathname } from "$app/types";

/**
 * Drop-in replacement for `resolve` from `$app/paths` for this app's internal
 * navigation. Kit's own `resolve` builds `${base}#${path}`, and under Home
 * Assistant ingress `base` loses the document's trailing slash
 * (`/api/hassio_ingress/<token>` vs `/api/hassio_ingress/<token>/`). The hash
 * router treats any pathname that differs from `location.pathname` as an
 * external URL (sveltejs/kit#14894), so every `goto`/anchor becomes a
 * full-page navigation to the slashless URL — which the Supervisor answers
 * with a plain 404.
 *
 * Anchoring the hash to the *current* document URL keeps the pathname
 * byte-identical, so the router always handles the navigation in-page. Routes
 * here are static (no params), so a plain `Pathname` signature covers all
 * call sites.
 */
export function resolve(path: Pathname): string {
  // The SSR pass renders only the empty shell and never navigates; any
  // syntactically valid href will do.
  if (!browser) return `#${path}`;
  return `${location.pathname}${location.search}#${path}`;
}
