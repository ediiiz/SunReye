# TODO — before 0.8

Working list for the 0.8 release. Current: 0.7.1.

## Home Assistant compatibility (must-fix)

- [ ] **Replace deprecated `object_id` with `default_entity_id` in MQTT discovery**
  - HA deprecates `object_id`; it stops working in **HA Core 2026.4**.
  - Source: [apps/server/src/mqtt.ts:102](apps/server/src/mqtt.ts#L102) (`object_id: sunreye_${slug(m.key)}` in `shared`).
  - Not a rename: `default_entity_id` needs the full entity id **including the component domain**
    (e.g. `sensor.sunreye_ac_ups_l2_voltage`, `select.sunreye_...`, `number.sunreye_...`).
  - Domain is only known per-branch in `discoveryConfig` (`sensor`/`select`/`number`), not in `shared` —
    build `default_entity_id` from `component` + slug there instead of setting `object_id` in `shared`.
  - Also seen `_2` suffixes in HA (id collisions): `object_id` omits `profileId` while `unique_id` includes it.
    Confirm multi-profile installs don't collide once switched to `default_entity_id`.

- [ ] **Give writable number metrics an explicit `range` so HA stops rejecting values**
  - Symptom: `Invalid value for number.sunreye_timeofuse_power_*: 6000 (range 0.0 - 100.0)` — 2M+ occurrences.
  - Root cause: `timeofuse/power/*` has no `range`
    ([packages/inverter-deye-sg05lp3/src/metrics.ts:635](packages/inverter-deye-sg05lp3/src/metrics.ts#L635)),
    so `entityConstraint` returns `min/max: undefined`
    ([packages/inverter-core/src/entities.ts:47](packages/inverter-core/src/entities.ts#L47)),
    `clean()` drops them, and HA defaults to **0–100**.
  - Fix: add a sensible `range` to `timeofuse/power/*` (unit W).
  - Audit all `access: "rw"` numbers with no `range` — same trap; consider a discovery-side fallback so a
    missing range never silently becomes HA's 0–100.

## Data quality

- [ ] **Inverter efficiency can go negative or exceed 100% — breaks graph scaling**
  - Metric `inverter/efficiency` is a computed `ratio`
    ([packages/inverter-deye-sg05lp3/src/metrics.ts:346](packages/inverter-deye-sg05lp3/src/metrics.ts#L346)):
    `num = ac.ups.total_power`, `den = dc.total_power + battery.power + ac.total_power`, ×100.
  - `battery.power` and `ac.total_power` are **signed** (charge/export negative), so the denominator can
    shrink, near-zero, or go negative → ratio > 100% or < 0. `ratio` only guards `den === 0`
    ([packages/inverter-core/src/profile-data.ts:150](packages/inverter-core/src/profile-data.ts#L150)).
  - The metric's `range: { min: 0, max: 100 }` does **not** help: `range` only caps writable sliders/writes,
    not computed values ([packages/inverter-core/src/define.ts:145](packages/inverter-core/src/define.ts#L145)).
  - Fix options (decide):
    - Clamp computed measurements to their `range` in `applyComputed` / `compileComputeExpr`
      (general fix — any out-of-range computed metric benefits).
    - Fix the model: denominator should be true power *into* the inverter (PV + battery discharge only +
      grid import only), not a signed sum — so efficiency is physically 0–100%.

## UI

- [ ] **Rework overview into a single-screen, non-scrollable dashboard (mobile + desktop)**
  - Files: [apps/web/src/routes/(app)/+page.svelte](apps/web/src/routes/(app)/+page.svelte),
    [apps/web/src/lib/components/inverter/power-flow-diagram.svelte](apps/web/src/lib/components/inverter/power-flow-diagram.svelte).
  - **Core constraint: everything fits in one viewport — no scrolling on mobile OR desktop.** Built for
    **wall displays / kiosks** (pairs with the public read-only toggle above): a single overview of the most
    important live values, always fully visible.
  - **Mobile idea** (from mockup): single-column stack sized to `100dvh` —
    1. Vertical power-flow card: **Solar** on top → inverter → bottom row of **Battery** (w + SoC%),
       **Grid** (w), **Consumption** (w), with animated flow dots along each leg.
    2. **Weather tile**: temp + condition icon + location (e.g. `23 °C · Limburg-Weilburg`).
    3. **Daily energy tiles** 2×2: Daily Production, Daily Consumption, Daily Feed-In, Daily Purchase (kWh).
  - Desktop: same building blocks laid out to fill one screen (flow + tiles side-by-side), no scroll.
  - Design decisions to settle:
    - **Curate the "most important values"** — the single screen forces a hard cut. Decide the fixed set;
      relegate everything else (all the subsystem sections: Battery/Inverter/Solar/Grid/…) to detail views
      off the overview, not below the fold.
    - **Fit strategy** — how content scales across viewport sizes without scroll (fluid sizing / clamp,
      `dvh` units, grid that reflows but never overflows).
    - **Weather card** — new; needs an external data source (location + provider). New dependency/config.
    - **Daily energy tiles** — map to existing daily-energy roles/metrics or add if missing.

## Costs

- [ ] **Rework the Costs headline tiles for clarity**
  - Files: [apps/web/src/routes/(app)/costs/+page.svelte](apps/web/src/routes/(app)/costs/+page.svelte),
    server calc [apps/server/src/cost-calc.ts](apps/server/src/cost-calc.ts).
  - **New tile set** (replaces the current 6-tile grid):
    - **GRID COST** — what you actually pay the utility, **without** subtracting export earnings.
      = `importCost + standingCharge`. (Today's "Total cost" is `net`, which *does* subtract export — that's the
      confusing part.)
    - **EFFECTIVE COST** — grid cost after export income = current `net` (`importCost − exportEarnings +
      standingCharge`). Keep it, but clearly secondary to Grid Cost.
    - **GRID IMPORT** — `importKwh` + `importCost` (rename of "Grid import").
    - **GRID EXPORT** — `exportKwh` + `exportEarnings` (rename of "Export earnings").
    - **SOLAR SAVING** — `solarSavings` (`gridOnlyCost − importCost`), **with the numbers shown**, e.g.
      `21 kWh × 0,31 € = 6,51 €`, so it's self-explanatory.
    - **TOTAL SAVINGS** — how much better off than buying everything from the grid.
      = `solarSavings + exportEarnings` = the existing `c.savings` field (`gridOnlyCost − importCost +
      exportEarnings`), just **renamed** from the unclear "Savings vs grid-only". Standing charge excluded (paid
      on all-grid too). Sub-caption should show the breakdown: `solar saving + export earnings`.
      NOTE: not `effective cost + solar saving` — effective cost is a cost, so that sum doesn't yield savings.
  - **Remove the "Net cost per day" section** — redundant with the total-cost bars / other charts.
  - **Add a click-to-open info icon on each tile** explaining what the value means (and its formula).
    Use the existing shadcn **`popover`** ([apps/web/src/lib/components/ui/popover](apps/web/src/lib/components/ui/popover)),
    not `tooltip` — click/tap works on touch + wall displays where hover doesn't. Add a small info icon in the
    tile header (extend the `tile` snippet in the costs page to take an optional explanation). Each explanation:
    plain-language meaning + the formula (e.g. Grid Cost = "what you pay the utility, before export earnings =
    import + standing charge").
  - **Server change needed for the Solar Saving breakdown**: the API doesn't return the pieces to render
    `kWh × price`. Add self-consumed kWh (`loadKwh − importKwh`) and an average/effective import price to the
    cost response so the tile can show the breakdown instead of the vague "self-consumed × grid price" caption.

- [ ] **Settings tabs scroll horizontally on desktop despite free space**
  - [apps/web/src/routes/(app)/settings/+page.svelte:64-71](apps/web/src/routes/(app)/settings/+page.svelte#L64-L71).
  - Cause: page is `max-w-3xl` (768px), tab strip is `overflow-x-auto` + `Tabs.List class="w-max"`. With 9 tabs
    the strip exceeds 768px and scrolls *inside the narrow column*, even though the viewport has room.
  - Fix: on desktop (`sm+`) let the tabs **wrap** instead of scroll (drop `w-max`, allow flex-wrap), or let the
    tab strip use the full available width while form content stays `max-w-3xl`. Keep the horizontal scroll only
    as the mobile fallback.

## Live data

- [ ] **On resume from background, reconnect for latest data instead of replaying the backlog**
  - Symptom: open on phone → switch apps → return ~5 min later → the dashboard replays the queued history
    sample-by-sample instead of showing current values.
  - Cause: [apps/web/src/lib/inverter/store.svelte.ts:142-157](apps/web/src/lib/inverter/store.svelte.ts#L142-L157)
    has no `visibilitychange` handling and no reconnect. The WS stays open while backgrounded; the browser
    queues 1 Hz samples and flushes the whole backlog on resume, and the handler appends each one in order.
  - Fix: on `visibilitychange` → hidden, close the stream; → visible, reconnect and re-`#backfill()` so the
    buffers jump straight to the newest data. Discard any queued/stale samples rather than animating through
    them (e.g. drop samples older than the reconnect, or reset series on reconnect).
  - **Do together with the WS reconnect/backoff work** in the read-lockdown plan (same `#connect` path) —
    reconnect needs `EdenWS .on('close')` backoff anyway.

## Profiles & simulator

These three are coupled: removing the bundled profile leaves the box with **zero profiles**, so the generic
simulator (demo without hardware) and the baked-in default source (install real profiles) must land together.

- [ ] **Generic simulator driven by primitives, not the SG05 profile**
  - Today `SimulatedInverter` ([packages/inverter-core/src/simulator.ts](packages/inverter-core/src/simulator.ts))
    is generic but delegates the coherent power model to `profile.simulate`; only SG05 implements that hook.
  - Add a role/primitive-based generic power model in `inverter-core` so the simulator produces plausible,
    coherent samples for **any** profile (or a bare primitive set) with no profile-specific `simulate` hook —
    drive it off canonical roles (pv/battery/grid/load power, SoC, etc.) so the "try without hardware" demo
    survives after SG05 is removed.
  - **Time-aware and somewhat physically accurate** (decision): model the time of day —
    - PV follows a diurnal curve (zero at night, bell around solar noon; optionally seasonal).
    - Battery SoC **integrates** charge/discharge over elapsed time (surplus charges, deficit discharges),
      clamped to 0–100%, respecting charge/discharge power limits.
    - A daily load pattern (morning/evening bumps), with grid making up the balance (import/export sign).
    - Energy counters (daily/total kWh) accumulate consistently with the power flows.
    - Use real elapsed wall-clock time between ticks so day/night and SoC drift look right on a wall display.
  - Keep `profile.simulate` as an optional override; fall back to the generic model when absent.

- [ ] **Remove the SG05 profile from this repo; move to `~/code/SunReye-Official-Profiles`**
  - Package `packages/inverter-deye-sg05lp3` → rebuild/move into the official-profiles repo (authored with
    `@sunreye/profile-sdk`).
  - Drop the side-effect self-register at [apps/server/src/inverter.ts:30](apps/server/src/inverter.ts#L30)
    (`import "@SunReye/inverter-deye-sg05lp3"`) and the "ship additional inverter support in the box" comment.
  - Update importers/tests that reference it: `apps/server/src/onboarding.test.ts`,
    `packages/profile-sdk/src/profile-sdk.test.ts`, `.../cli-commands.test.ts`,
    `packages/inverter-deye-sg05lp3/src/limits.test.ts`, and the `deye-sg05lp3` example comment in
    `packages/db/src/schema/settings.ts`.
  - Consequence (intended): **no active profile from the start** — the box boots onboarding-only, admin
    installs a profile from the default source (next item) or runs the generic simulator. This is the expected
    fresh-boot state now, not a degraded fallback; make sure the onboarding UX reads that way.

- [ ] **Bake in the default profiles repo**
  - Default `profileSourcesSchema` to include
    `https://github.com/SunReye/SunReye-Official-Profiles` instead of an empty list
    ([packages/db/src/profiles.ts:45-47](packages/db/src/profiles.ts#L45-L47) — currently
    `sources: [].default([])`, comment "No source ships by default").
  - Update the comment. Existing installs get the default **back-filled via merge-on-read** (decision): inject
    the official source when absent from the stored list, rather than a one-shot migration.
  - The official source **can be disabled but not removed** (decision): merge-on-read always ensures it's
    present; the user can toggle its existing `enabled: false` flag to skip it, but delete is blocked for this
    source. Enforce in the profile-sources write path/UI (mark it as a protected/default source so the delete
    action is hidden/rejected while the enable toggle stays available).

- [ ] **Chart hover dot is off the line on live sparklines**
  - The tooltip highlight point sits away from the plotted line when hovering live KPI charts
    (Total Grid Power etc.). Does **not** affect custom charts.
  - Cause: [apps/web/src/lib/components/inverter/live-area.svelte](apps/web/src/lib/components/inverter/live-area.svelte)
    glides by translating the marks `<g>` per frame (`translate(${glideX(context.xScale)}, 0)`, ~line 97), but
    LayerChart's `bisect-x` tooltip/highlight dot is positioned in the **untranslated** data space, so the dot
    is offset from the line by exactly `glideX`. Custom charts are static (no glide transform) → unaffected.
  - Fix: apply the same `glideX` offset to the highlight indicator (render the dot inside the translated marks
    group, or shift the tooltip point by `glideX`) so it tracks the visible line.

## i18n

- [ ] **Add Paraglide (Inlang) i18n and externalize most webui strings**
  - Docs: https://svelte.dev/docs/cli/paraglide — compiler-based, tree-shakeable `m.*()` message functions.
  - **Locale = browser detection** (decision): use the `preferredLanguage` strategy (reads `navigator.languages`)
    with `localStorage` persistence and `baseLocale` fallback — e.g. strategy `["localStorage",
    "preferredLanguage", "baseLocale"]`. **No `url` strategy.**
  - **Do NOT take the default `sv add paraglide` scaffold wholesale**: it wires SvelteKit `reroute`/`handle`
    **server hooks** and URL-based locale routing. This app is a **pure SPA — hash router, SSR off, no server
    routes** ([apps/web/svelte.config.js:32](apps/web/svelte.config.js#L32)), so URL prefixes can't work under
    the hash router (see [[ingress-404-kit-hash-router-bug]]) and the server `handle` hook is moot. Keep only
    the Vite plugin + client message runtime; configure the strategy manually without `url`.
  - Verify the Paraglide Vite plugin plays with the **static adapter + relativized fallback** build
    (`build:static` → `scripts/relativize-fallback.ts`) so it still works behind HA ingress.
  - Extract most user-facing strings across `apps/web/src` into messages.
    **Languages: `en` (base), `de`, `es`, `it`, `fr`.** Add a manual locale override in Display settings (falls
    back to browser detection when unset).
  - Scope note: profile-derived text (metric labels, group names, enum labels) comes from profile **data**, not
    the webui, so it stays untranslated unless the profile SDK gets its own translation mechanism. "Most
    strings" = app chrome / nav / settings / labels, not inverter metric names.
  - `en` is the source of truth for messages.
  - **Lint for missing/untranslated keys** (decision): fail the check when a locale is missing a key present in
    `en`, so a new string can't ship silently English. Wire into the existing `check` step / pre-commit.

## Access & auth

- [ ] **Add "public read-only dashboard" toggle**
  - Goal: when enabled, viewing the live dashboard needs **no login** — **fully anonymous**, anyone with the
    URL sees the live status. Signing in is only needed to change settings.
  - **Primary use case: wall displays / kiosks** — a screen left on to show current status. After a session is
    deleted/expired the display keeps showing the dashboard instead of bouncing to login.
  - Store as an `app_settings` flag via [apps/server/src/app-settings.ts](apps/server/src/app-settings.ts)
    (admin-only to change).
  - Guard behavior: when on, dashboard **read** routes + `/ws/metrics` stay public; **config reads stay
    admin, all writes/commands stay gated**. The `requireSession` macro
    ([apps/server/src/routes/admin-guard.ts](apps/server/src/routes/admin-guard.ts)) should consult this flag.
  - Web: when the flag is on, skip the 401 → login redirect for dashboard routes; keep it for settings/controls.
  - **Directly coupled to the read-lockdown work below** — design them together so the toggle is the opt-out
    from the lockdown, not a bolt-on. Off by default = locked down; on = today's public-read behavior for the
    dashboard only.

## Planned work (candidates for 0.8 — confirm scope)

- [ ] **Lock down read endpoints** — config reads → admin, dashboard reads → session, WS reconnect/backoff.
      Branch `feat/lock-down-reads` exists. Plan: `~/.claude/plans/lazy-jingling-anchor.md`.
      Design together with the **public read-only dashboard toggle** (Access & auth) — that toggle is the opt-out.
- [ ] **Hidden metrics (PR A)** — web-only hide toggle via `uiPrefs` in `app_settings` + Display settings tab.
- [ ] **Broaden Modbus model + capture/replay (PR B0–B3)** — FC4/wordOrder support, NDJSON capture, replay CLI.
      Plan: `~/.claude/plans/graceful-splashing-karp.md`.
- [ ] **Register scanner (PR B4)** — `profile scan` CLI: FC3/FC4 sweep, type/scale classification, `--scaffold`.
