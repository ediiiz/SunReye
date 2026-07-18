import type { CompilerOptions } from "@inlang/paraglide-js";

/**
 * Single source of truth for the Paraglide compiler options, shared by the Vite
 * plugin (dev/build) and `scripts/compile-i18n.ts` (svelte-check / CI), so the
 * two can never drift.
 *
 * SPA + hash-router + SSR-off: NO `url` strategy and no server hooks. Locale is
 * localStorage (the manual override in Display settings) → the browser's
 * preferred language → the base locale. `isServer: "false"` — this bundle only
 * ever runs in the browser, so tree-shake the server branches out.
 */
export const paraglideOptions = {
  project: "./project.inlang",
  outdir: "./src/lib/paraglide",
  strategy: ["localStorage", "preferredLanguage", "baseLocale"],
  isServer: "false",
} satisfies CompilerOptions;
