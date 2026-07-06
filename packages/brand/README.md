# @SunReye/brand

Canonical brand assets — single source of truth for the SunReye logo across the
docs site and web app. One mark, one look: a flat sun in the app's primary blue
(Tailwind blue-600, `#2563eb`), matching the web app's sharp industrial console.

- `logo.svg` — animated variant (slow ray rotation). Self-contained: CSS
  animation is embedded, so it animates when loaded via `<img>` and honors
  `prefers-reduced-motion`. Use for hero/nav placements.
- `mark.svg` — static, thicker-ray variant for favicons and tiny renders.

Consumers:

- `apps/docs` — Starlight `logo.src`, splash hero, and `public/favicon.svg`
  (uses `mark.svg`). Docs theming (`apps/docs/src/styles/theme.css`) mirrors the
  web app palette from `apps/web/src/app.css`.
- `apps/web` — `static/favicon.svg` (uses `mark.svg`). The in-app logo
  (`apps/web/src/lib/components/logo.svelte`) is the same geometry redrawn in
  `currentColor` so it follows the app palette; it does not import these files.

The docs asset and both favicons live inside each app's static/asset dir because
Astro's pipeline and static serving want a physical file. Run `bun run sync:brand`
from the repo root to refresh them from the sources here.
