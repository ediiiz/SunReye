/**
 * i18n message lint: every non-base locale must define exactly the base
 * locale's keys — no missing, no stale extras.
 *
 * Deliberate exception: a locale that is *entirely* empty (no keys yet) is
 * reported as "pending" and does NOT fail. de/es/it/fr ship empty on purpose
 * and get filled in by humans over time; a blocking gate on them would wedge CI
 * for months. Once a locale has at least one key it's considered "in progress"
 * and is held to the full base keyset, so partial translations can't silently
 * drift. Exit 1 on any missing/extra key in an in-progress locale.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES_DIR = join(import.meta.dir, "..", "messages");
const SETTINGS = join(import.meta.dir, "..", "project.inlang", "settings.json");

type Settings = { baseLocale: string; locales: string[] };

const settings = JSON.parse(readFileSync(SETTINGS, "utf8")) as Settings;
const { baseLocale, locales } = settings;

/** Message keys in a locale file, excluding the `$schema` pointer. */
function keysOf(locale: string): string[] {
  const raw = JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8")) as Record<
    string,
    unknown
  >;
  return Object.keys(raw).filter((k) => k !== "$schema");
}

const baseKeys = new Set(keysOf(baseLocale));
let failed = false;
const pending: { locale: string; missing: number }[] = [];

for (const locale of locales) {
  if (locale === baseLocale) continue;
  const keys = keysOf(locale);

  if (keys.length === 0) {
    pending.push({ locale, missing: baseKeys.size });
    continue;
  }

  const has = new Set(keys);
  const missing = [...baseKeys].filter((k) => !has.has(k));
  const extra = keys.filter((k) => !baseKeys.has(k));

  if (missing.length > 0 || extra.length > 0) {
    failed = true;
    console.error(`✗ ${locale}: in progress but not in sync with ${baseLocale}`);
    if (missing.length > 0) console.error(`    missing (${missing.length}): ${missing.join(", ")}`);
    if (extra.length > 0) console.error(`    stale (${extra.length}): ${extra.join(", ")}`);
  } else {
    console.log(`✓ ${locale}: complete (${keys.length} keys)`);
  }
}

for (const p of pending) {
  console.log(`• ${p.locale}: not started — ${p.missing} keys pending translation`);
}

if (failed) {
  console.error("\ni18n lint failed: fix the in-progress locales above.");
  process.exit(1);
}
console.log(`\ni18n lint passed (${baseKeys.size} base keys in ${baseLocale}).`);
