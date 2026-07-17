/**
 * Thin wrapper over the generated Paraglide runtime. The locale is a per-browser
 * preference (localStorage strategy) — not the instance-wide, server-persisted
 * display config — so switching it is a client-only action that reloads the page
 * (Paraglide's default) to re-render every message.
 */
import { getLocale, locales, setLocale } from "$lib/paraglide/runtime";

export { getLocale, locales, setLocale };

/**
 * The language's own name (endonym), e.g. "Deutsch" for `de` — shown in the
 * locale picker so a speaker recognizes their language regardless of the current
 * UI locale. Falls back to the code if `Intl.DisplayNames` is unavailable.
 */
export function localeName(locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}
