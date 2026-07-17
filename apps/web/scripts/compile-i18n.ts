/**
 * Compile the Paraglide messages into `src/lib/paraglide/` (a git-ignored,
 * auto-generated module). The Vite plugin does this on dev/build, but
 * svelte-check and a fresh CI checkout need the module to exist before Vite
 * ever runs — so `check`/`prepare` invoke this first. Options are shared with
 * the Vite plugin via ./i18n.config.ts so the two never drift.
 */
import { compile } from "@inlang/paraglide-js";
import { paraglideOptions } from "../i18n.config";

await compile(paraglideOptions);
