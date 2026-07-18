# TODO

## UI

- [ ] **Use the same sidebar for desktop as mobile**
  - Currently the sidebar renders two different ways from viewport width
    ([apps/web/src/lib/components/ui/sidebar/sidebar.svelte](apps/web/src/lib/components/ui/sidebar/sidebar.svelte)):
    - Mobile (`sidebar.isMobile`) → `Sheet` overlay that slides in over the content,
      opened by the header `Sidebar.Trigger`, dismissed on navigation.
    - Desktop → always-visible `collapsible="icon"` rail that reserves layout width.
  - Goal: desktop uses the mobile overlay `Sheet` too — one behaviour on every
    viewport (hamburger trigger + slide-in overlay, no permanent rail).
  - Changes needed:
    - `sidebar.svelte`: make the `Sheet` branch the single path (drop the
      `{:else}` desktop rail branch); keep `collapsible="none"` as-is.
    - `context.svelte.ts`: `toggle()` must drive `openMobile` on all viewports,
      not `setOpen` — otherwise the trigger won't open the overlay on desktop.
    - `app-sidebar.svelte`: `closeSidebar()` should close the overlay on every
      viewport (drop the `sidebar.isMobile` guard) so nav clicks dismiss it.
  - After: `IsMobile` hook + `isMobile` getter likely become dead — remove or
    keep intentionally; run `bunx fallow dead-code`.
  - Verify: overlay opens/closes via trigger on desktop, dismisses on nav,
    content spans full width with no reserved rail gap.

- [ ] **Remove DC/AC and "Inverter Online" labels from the power-flow diagram**
  - File: [apps/web/src/lib/components/inverter/power-flow-diagram.svelte](apps/web/src/lib/components/inverter/power-flow-diagram.svelte).
  - Remove the connector-type pills (`DC` / `AC`) rendered at each segment bend
    (the `{#each lines as l (pill-${l.id})}` block, ~lines 143–151).
  - Remove the hub caption showing the status dot + `label_inverter()` +
    online/connecting text (the `top-full` caption `div`, ~lines 195–205).
  - After removal, check for now-unused pieces: the `pill` field on `Line` +
    `midpoint()` (only used for pill placement), and `flow_online()` /
    `label_inverter()` message keys — run `bunx fallow dead-code`.

## Data quality

- [ ] **`inverter.efficiency` is computed with a physically wrong model (shows ~64% instead of ~95%)**
  - **Layer: profile bug** (the `computeExpr`), not web (display-only) and not
    server logic — the ratio evaluator does exactly what the expression says.
  - Current expression (see fixture
    [packages/profile-sdk/src/__fixtures__/sample-profile.json:576-588](packages/profile-sdk/src/__fixtures__/sample-profile.json#L576-L588),
    same shape in the shipped Deye profile):
    - `num = [ac.ups.total_power]`
    - `den = [dc.total_power, battery.power, ac.total_power]`, `scale = 100`
  - Evaluator sums the `den` keys **signed** and only guards `den === 0`
    ([packages/inverter-core/src/profile-data.ts:150-154](packages/inverter-core/src/profile-data.ts#L150-L154)).
    `battery.power` (negative while charging) and `ac.total_power` (signed:
    import/export) shrink the denominator, so the ratio is garbage.
  - Real-world case (battery charging): PV 4398 W, battery +3766 W charge,
    house load 407 W, grid −8 W.
    - Displayed: `407 / (4398 − 3766 − 8) ≈ 407 / 632 ≈ 64%`.
    - Physically correct: output / generation
      `= (3766 + 407 − 8) / 4398 ≈ 4165 / 4398 ≈ 95%`
      (the 233 W gap = self-consumption/conversion loss, normal).
  - `range: { min: 0, max: 100 }` + `applyComputed` clamping does **not** save
    this — 64% is in range, so it's never clamped
    ([packages/inverter-core/src/computed.ts](packages/inverter-core/src/computed.ts)).
  - Fix (profile): redefine the ratio so numerator = useful power delivered and
    denominator = power *into* the inverter using **directional** (positive-only)
    components — PV + battery *discharge* only + grid *import* only — not a signed
    sum. `num` should be total load served, not just the UPS/backup output.
  - Blocker: the generic `ratio` expr can't express "positive part of a signed
    metric." Either (a) add a directional/clamp primitive to the compute grammar
    in inverter-core ([profile-data.ts](packages/inverter-core/src/profile-data.ts),
    [schema.ts](packages/inverter-core/src/schema.ts),
    [define.ts](packages/inverter-core/src/define.ts)) and use it in the profile,
    or (b) expose import-only / discharge-only roles the profile can reference.
    Decide which before implementing.
  - Note: this supersedes the older "efficiency can exceed 100% / go negative"
    item — clamping was only a band-aid; the model itself is wrong.
  - **Cross-repo — the broken formula actually lives in `~/code/SunReye-Official-Profiles`,
    duplicated in both families (identical):**
    - `src/families/deye-sg05lp3.ts:346-352`
    - `src/families/deye-sg01hp3.ts:669-675`
    - The fixture in this repo is just a copy; all 12 built `profiles/*.json`
      derive from these two family files.
  - **Fix is two repos, coupled — do in order:**
    1. inverter-core (this repo): add the directional/clamp primitive (or
       import-only / discharge-only roles). Enabler only — changes no value alone.
    2. SunReye-Official-Profiles: rewrite `computeExpr` in **both** families to
       use it, then rebuild + republish profiles.
    - Ordering: profiles can only reference the new primitive once inverter-core
      ships it, so #1 lands first and the profiles' SDK version floor bumps to
      that release. Editing the family content auto-bumps each profile's semver
      (see profile-sdk versioning).

- [ ] **Remove the top header; move theme toggle into Display settings**
  - File: [apps/web/src/routes/(app)/+layout.svelte](apps/web/src/routes/(app)/+layout.svelte),
    the `<header>` block inside the `shell()` snippet (~lines 121-146).
  - Remove the whole header and everything in it:
    - `Live` / connecting status `Badge`
    - read-only ("write protected") `Badge`
    - `Login` button (anon)
    - light/dark theme toggle button
    - breadcrumb ("Überwachung / Übersicht")
  - **Keep only the sidebar-open button** — the header holds `Sidebar.Trigger`,
    the only way to open the sidebar (more so once the sidebar becomes
    overlay-only on desktop, see the sidebar TODO above). Keep it, but render it
    as a floating overlay (e.g. `fixed` top-left, high `z-index`) so it sits
    *above* the page content and does **not** occupy layout space / shift the
    content down. Everything else in the header goes.
  - Redundancy check (safe to drop from header):
    - Anon `Login` — the sidebar footer already has a login entry
      ([apps/web/src/lib/components/app-sidebar.svelte:136-148](apps/web/src/lib/components/app-sidebar.svelte#L136-L148)).
    - Section title — the active nav item in the sidebar already shows location.
    - Confirm nothing else depends on the header's `Live` badge for status; the
      power-flow diagram's own status caption is also being removed (see TODO
      above), so decide if live/connecting status needs a home anywhere.
  - **Theme → Display settings select:**
    - Add a Light / Dark / System select to the display form
      ([apps/web/src/lib/components/settings/display-form.svelte](apps/web/src/lib/components/settings/display-form.svelte)),
      reusing `OptionSelect` and sitting alongside Language.
    - Theme is a per-browser preference like Language (no admin gate, no
      draft/save cycle): mode-watcher persists it itself. Use
      `setMode('light' | 'dark' | 'system')` + `userPrefersMode` from
      `mode-watcher` instead of the current `toggleMode`.
    - `ModeWatcher` already mounts in
      [apps/web/src/routes/+layout.svelte](apps/web/src/routes/+layout.svelte)
      with `defaultMode="dark"` — keep it; just drive it from the select.
    - Drop the now-unused `toggleMode` import + `action_toggle_theme` message key
      from the app layout; run `bunx fallow dead-code`.
  - After header removal, check `Sidebar.Inset` / `<main>` top spacing still
    looks right without the 14px header bar.

## Dashboard

- [ ] **Broken word wrap on narrow screens (weather tile overlaps/clips)**
  - Symptom (phone width): temperature and the forecast figures collide
    (`24°C` runs into `68.1 kWh`), and the location label (`Hering…`) is clipped.
  - File: [apps/web/src/lib/components/inverter/weather-tile.svelte](apps/web/src/lib/components/inverter/weather-tile.svelte).
  - Root cause: the tile is a single horizontal flex row
    (`flex items-center gap-4`, line 70) with three children forced side-by-side
    at **every** width — icon · temp/condition/location · forecast (today/
    tomorrow). The forecast block is `shrink-0` (line 96) and the temperature
    span (lines 78-80) has no `truncate`, so on a phone the middle column
    (`min-w-0`) collapses toward zero and the big temp text overflows into the
    forecast column. The `lg:`/`2xl:` classes only set width — there's no
    small-screen layout, so nothing stacks or wraps.
  - Fix direction: give the tile a responsive layout so it stacks / wraps on
    narrow widths instead of cramming one row — e.g. `flex-wrap`, or a
    column layout below `sm`/`lg` with the forecast dropping under the
    temp+location block. Ensure the temp value and location can't be crowded to
    overlap (drop `shrink-0` on forecast at narrow widths, or move it to its own
    row). Verify with the weather tile both with and without `forecast`.
  - Secondary (confirm scope): the DailyEnergy KPI labels
    ([apps/web/src/lib/components/inverter/daily-energy.svelte](apps/web/src/lib/components/inverter/daily-energy.svelte),
    e.g. `HEUTE GESPA…`, `HEUTE VERDIE…`) are `truncate`d hard at narrow width.
    That's truncation by design, not the overlap bug — decide separately whether
    the German labels need shortening or a two-line allowance.

- [ ] **Tablet/desktop: two-column layout — portrait diagram left, cards right**
  - Currently on `lg+` the overview stacks vertically: full-width power-flow hero
    on top, then a horizontal strip of weather + energy cards below
    ([apps/web/src/routes/(app)/+page.svelte](apps/web/src/routes/(app)/+page.svelte)).
  - Goal: on tablet/desktop switch to a **two-column** layout — power-flow
    diagram on the **left**, all cards stacked on the **right**.
  - Use the **mobile (portrait) diagram view** on desktop too. Orientation is
    auto-derived from the diagram container's aspect ratio (`ow/oh < 1.1` →
    portrait) in
    [apps/web/src/lib/components/inverter/power-flow-diagram.svelte:40](apps/web/src/lib/components/inverter/power-flow-diagram.svelte#L40),
    so a **tall, narrow left column** makes it render portrait automatically — no
    prop needed. Confirm the column is narrow enough to trip the portrait branch.
  - Right column: stack the cards vertically instead of the current horizontal
    strip — weather tile on top, then the four energy cards
    ([daily-energy.svelte](apps/web/src/lib/components/inverter/daily-energy.svelte),
    currently a `grid-cols-2` / `auto-fit` grid). Decide whether the energy cards
    stay a 2-col grid within the right column or become a single column.
  - Keep the mobile (`< lg`) layout as-is: hero on top, cards below, scrolls.
  - Watch the existing no-scroll constraint on `lg+`
    (`lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden`, and note the `3.5rem`
    header offset changes / disappears once the header-removal TODO lands) — the
    two columns must fit the viewport height without scrolling.

## Costs

- [ ] **/costs energy-split shows ~7 kWh load for today while headline shows 8.6 kWh**
  - Not a chart-math bug: `gridToLoad + solarToLoad` always equals the series
    `loadKwh` by construction
    ([apps/server/src/energy-calc.ts:44-45](apps/server/src/energy-calc.ts#L44-L45)),
    so the `7 + 0.1` in the tooltip *is* the series `loadKwh`. The two numbers
    come from **two different sources that disagree for the in-progress day**:
    - Dashboard / costs headline (8.6) = live **`load.energy.today`** device
      register, streamed
      ([apps/web/src/lib/components/inverter/daily-energy.svelte:163-167](apps/web/src/lib/components/inverter/daily-energy.svelte#L163-L167)).
    - Energy-split chart (~7) = **day-delta of the cumulative `load.energy.total`**
      counter from `daily_rollups`
      ([apps/server/src/energy.ts](apps/server/src/energy.ts) →
      [apps/server/src/cost.ts:33](apps/server/src/cost.ts#L33),
      `load: "load.energy.total"`).
  - Ruled out: continuous-aggregate refresh lag — `daily_rollups` has
    `materialized_only = false`
    ([packages/db/src/timescale/0000_bootstrap.sql:89](packages/db/src/timescale/0000_bootstrap.sql#L89)),
    so the current day is served live via real-time aggregation.
  - Likely mechanism: the two device registers differ in resolution / update
    cadence (Deye `*.total` counters are often whole-kWh, `*.today` is 0.1 kWh),
    so mid-day the total-counter delta is quantized/behind the today register.
    Confirm by comparing raw `load.energy.total` vs `load.energy.today` samples.
  - Note: this only diverges on the **in-progress day**. Historical days have no
    `today` register, so the counter-delta method is the only source there — any
    fix must keep historical days on the delta method.
  - **Decision: use the `*.today` register for the current period.** For the
    in-progress period, source the chart's load (and the cost engine's `loadKwh`)
    from the live `load.energy.today` register so chart + headline agree; older
    periods stay on the `load.energy.total` delta method.
    - Scope check: `*.today` is a live/daily-reset register — this cleanly covers
      a **day** bucket that is "today". Decide behaviour for `hour` and `month`
      in-progress buckets (an hour-of-today or the current month) — the today
      register maps to the whole current day, not an arbitrary sub-bucket, so it
      may only substitute when the in-progress period *is* exactly today.
    - Apply consistently to the other energy fields that have a `*.today` twin
      (production/import/export) so the whole current-period split stays coherent,
      not just load.
    - **Why not a `*.today` *delta* everywhere (instead of the `*.total` delta)?**
      - `*.today` is daily-reset, not monotonic. The existing delta query
        `greatest(0, max - lag(max))`
        ([apps/server/src/cost.ts:323-326](apps/server/src/cost.ts#L323-L326))
        assumes a monotonic counter; at each midnight reset `max - lag(max)` goes
        negative → clamped to 0, so hour/month buckets crossing midnight would
        drop the reset bucket. Would need separate reset-aware delta logic.
      - Gap resilience (the real reason `*.total` is the historical source of
        truth): a missed sample self-heals on a cumulative counter (next reading
        still carries the full total). On `*.today`, missing the pre-midnight peak
        permanently undercounts that day — the register already reset to 0.
      - `*.today` is an optional role; not every profile has it, so `*.total` is
        needed as the baseline regardless.
      - Note: for a **day** bucket you don't need a `*.today` delta at all — a
        reset counter's daily max *is* the day total, and for *today* it's just
        the register's current value (what the dashboard reads).
  - Same root affects the cost engine: `cost-calc.ts` sums hourly `load` from the
    same `load.energy.total` deltas
    ([apps/server/src/cost-calc.ts:80-97](apps/server/src/cost-calc.ts#L80-L97)),
    so any self-sufficiency / savings figure derived from it shares the skew.
  - Minor display bug in the same tooltip: the series label runs into the value
    (`Aus Solar / Batterie7`) — no gap/room. Check the tooltip label/value
    spacing in [apps/web/src/lib/components/ui/chart](apps/web/src/lib/components/ui/chart)
    / the `chart_from_solar_battery` label width.
