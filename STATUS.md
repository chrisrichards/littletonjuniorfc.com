# Project status

Last updated: 2026-06-03.

Living document — update this when something material changes (phase completes, decision made, blocker found). For the original detailed plan see [`migration-plan.md`](./migration-plan.md); for the page-by-page audit see [`inventory.md`](./inventory.md).

## TL;DR

Migration from Joomla to Astro on Cloudflare Workers (static assets, built by Workers Builds). Visitor-facing site is **content-complete and deployed** at https://littletonjuniorfc.yellowfeather.workers.dev. **DNS is not switched** — public littletonjuniorfc.com still serves the old Joomla site on AWS Lightsail. The pitch booking system (Phase 4) is built but not yet live: Cloudflare Access is unconfigured and the bookings still need importing from a fresh Joomla dump.

## 2026-06-03 — uk-* markup → Tailwind grid + utilities (branch `tailwind-migration`)

Follow-on to the UIkit→Tailwind migration: converted the `uk-*` class names
still in the markup over to native CSS grid + Tailwind utilities, gated at every
step by the pixel-diff harness against `fbcec00` (pre-conversion). **Final state:
0/56 — pixel-identical at all 8 pages × 7 widths.**

- **Grids → native CSS grid.** Every `uk-grid` / `uk-child-width-*` /
  `uk-grid-match` became `grid grid-cols-N` (responsive `md:`=960 via the
  `@theme` breakpoints; the one `@s`=640 case uses `min-[640px]:`). A reusable
  `.card-grid` marker replaces `uk-grid-match`'s inner-fill **and reproduces
  UIkit's asymmetric negative-margin gutter exactly** — CSS `gap` is symmetric
  and silently shifted square cards 1.25px/cell (only visible where it compounds:
  the teams nav, 4 square rows). `CardGrid.astro` gained a transitional `tw`
  flag. Bespoke selectors were dual-hooked `:is(.uk-grid-match, .card-grid)` so
  conversion was pure markup; the teams nav colour matrix repointed to the
  teams-only plain `.grid-cols-4` class.
- **Presentational helpers → utilities.** `uk-text-center/-left`,
  `uk-padding-remove-*`, `uk-margin-remove-*` → `text-center`/`pt-0`/`mb-0`/
  `[&>*:first-child]:mt-0` etc. (these correctly override component defaults
  because `@layer utilities` sits above `@layer components`).
- **Dead UIkit classes removed:** `uk-card`, `uk-panel`, `uk-clearfix`,
  `uk-margin-auto` (present in markup but never reproduced in app.css).
- **Harness:** `shoot.mjs` now uses `reducedMotion: 'reduce'` so the on-scroll
  scrollspy fade can't be caught mid-animation (was a flaky teams@1024 diff).

**Deliberately NOT converted (decision 2026-06-03):** the remaining `uk-*` are
the **component layer** — `uk-section(-default)`, `uk-container`, `uk-card-body`,
`uk-card-primary/secondary`, `uk-width-1-1@m`/`uk-width-expand@m`, the `uk-grid`
attribute (74 CSS refs), `uk-grid-margin`, `uk-margin`/`uk-margin-top`. They
**can't be utilities** — bespoke rules must override them, which a higher-layer
utility forbids. The UIkit framework (CSS+JS) is fully gone; only these class
*names* keep the `uk-` prefix. A cosmetic de-`uk-` rename was offered and
declined (pure churn, no visual/payload change). Idiomatic to keep a named
component layer.

_Optional future cleanup (left in place, harmless): the now-dead non-`tw` branch
of `CardGrid.astro`, the dead `.uk-child-width-*` primitive defs, and collapsing
`:is(.uk-grid-match, .card-grid)` → `.card-grid` (uk-grid-match is gone from the
live markup)._

## 2026-06-02 — UIkit → Tailwind migration (branch `tailwind-migration`)

**UIkit is fully removed (CSS + JS), replaced by Tailwind v4 + one hand-authored
`src/styles/app.css`.** The site is visually within ~1% of the prior build at
every page/width; no framework JS remains.

Approach ("build the layer, then flip"): authored the complete replacement in
`app.css` (a `@layer base` reset + `@layer components` holding the UIkit
primitive subset reproduced 1:1, the bespoke responsive type/positioning
transcribed from the old custom.css/overrides.css, and the navbar/off-canvas),
keeping the old stylesheets linked + dormant; then one flip removed them and
rebuilt the navbar + off-canvas in vanilla JS. Tooling: `scripts/visual/`
(Playwright pixel-diff `shoot`/`diff` + `measure.mjs` computed-style dumper) vs
a `main` baseline, plus a git-worktree copy of the last dormant commit served
alongside for exact A/B measurement.

- **Removed:** `theme.css` (385 KB) + `custom.css` (39 KB) + `overrides.css`,
  `uikit.min.js` + `uikit-icons.min.js` (~200 KB), yootheme `theme.js`,
  `scripts/purge-css.mjs` + the `purgecss` dep + the purge build step
  (`build` is now plain `astro build`). **Net: ~292 KB dead CSS + ~256 KB dead
  JS gone from the build output; the only stylesheet served is the ~32 KB
  `app.css`.** Kept the licensed BebasKai/TradeGothic font files.
- **Chrome rebuilt static:** centred-logo navbar (responsive 380→250px geometry
  at the 960–1024 band), vanilla off-canvas drawer (~30 lines) + inline SVG
  hamburger/close, footer. Decorative behaviour dropped per plan: the no-op
  home/sponsor filter tabs. Kept: teams "More" panel
  JS, counter count-up. (The scrollspy fade-in was dropped then re-added —
  see the 2026-06-03 follow-up below.)
  - **✅ DONE (2026-06-03):** the on-scroll **card fade-in** is re-added as a
    vanilla `IntersectionObserver` + CSS fade (no UIkit). Cards carrying
    `uk-scrollspy-class` (Card.astro) start `opacity:0` and fade in over 0.8s
    (matching UIkit's `uk-fade`) as their top edge enters the viewport — the
    observer in `BaseLayout.astro` adds `.uk-scrollspy-inview` (no `rootMargin`,
    so a card peeking at the bottom is already fading rather than sitting
    blank). The `opacity:0` is gated behind `.scrollspy-enabled` on `<html>`,
    set synchronously by an inline `<head>` script only when JS +
    `IntersectionObserver` are present and motion isn't reduced — so cards stay
    visible with no JS / reduced motion, and the gate lands before first paint
    (no flash). CSS lives in `app.css` (`@layer components`).
    - **Scope matches the live site, not just home.** `Card.astro` now emits
      `uk-scrollspy-class` **by default** (opt out with `scrollspyClass={false}`),
      because the live site faded essentially every card. Faded-card counts per
      page vs. the live mirror: home 8/8, teams 16/16, contact-us 20/20,
      official-info 32/36, membership 4/5, resources 44/46 (the small shortfalls
      are non-`Card` elements — section wrappers + `QuoteImage` image/featured
      cards — that the live site faded only subtly). **Opt-outs:** the home
      counters + sponsors (never faded live) and the teams squad-detail
      `.hiddenbox` panel cards (live faded only the nav grid).
    - Verified by Playwright across all 6 pages: every faded card starts
      `opacity:0` at load and reaches `opacity:1` after scrolling (0 stuck
      hidden); stays visible under `reducedMotion: reduce` and with no JS.
- **Visual regression (8 pages × 7 widths = 56):** 18 pixel-identical; the other
  38 are all **< 1.1%** (mostly < 0.3%) — sub-pixel glyph/line-height and
  5–12px margin nuances, treated as acceptable. Notable bugs found + fixed along
  the way: a `background-color` transition rendering mid-animation during
  capture (contact-us 38%→0.4%), a hero `z-index` regression that hid the navbar,
  and several `!important`/responsive rules dropped in transcription.
- **Known-acceptable residual micro-diffs:** teams@375 (~1.1%, footer sits ~12px
  high); official-info@640 (0.6%); ~35 others < 0.3%; 4 SIZE diffs of +1…+10px
  on membership/official-info @960/1024. None visible in normal use.

## 2026-05-31 — Optimisation & de-duplication pass (branch `optimise-dedupe`)

Staged commits on the branch (see git log), interaction-tested throughout
(teams "More" panel, mobile off-canvas, counter animation):

1. **De-dup** — home page (hero, counters, **squares**, sponsors) and all pages
   migrated onto shared components. `Section.astro` is now actually used; new
   `CardGrid.astro` + `QuoteImage.astro`; `Card.astro` extended for `uk-img`
   lazy/responsive images; new `lib/cta.ts`.
2. **Perf** — preload BebasKai/TradeGothic woff2, `font-display:swap`, `defer` on
   UIkit/theme scripts.
3. **CSS purge** — `scripts/purge-css.mjs` (PurgeCSS) wired into `npm run build`:
   theme.css 385→242KB (−37%), custom.css 39→32KB.
4. **Images (in-place)** — an interim sharp re-encode pass (−49%). **Superseded
   and removed** by Stage 5 (astro:assets already optimises every image), so the
   script no longer exists.
5. **Images (astro:assets)** — full conversion: images moved to `src/assets`,
   resolved from stored string paths via `src/lib/images.ts`, rendered through
   `<Picture>`/`<Image>` (AVIF/WebP + responsive `srcset`); `uk-img` retired for
   images; logo converted. `astro.config.mjs` set to `imageService: 'compile'`
   so the Cloudflare adapter emits **static** `_astro/*` images at build (its
   default on-demand `/_image` Worker produced no static files and 404'd on a
   static host). Redundant `public/images/*` rasters + `templates/yootheme/cache`
   deleted (`public/images/downloads` PDFs kept). Verified by reading screenshots
   (modern-format re-encode means pixel-diff is not meaningful here) + the same
   interaction tests.

Stages 1–4(in-place) were verified pixel-identical (0/16). Stage 5 changes image
bytes by design (AVIF/WebP), so it was verified by visual read + layout-dimension
probe, not pixel-diff.

Not yet merged to `main`. Booking system (Phase 4 of migration-plan) still the
launch blocker.

## Phase progress against migration-plan.md

| Phase | Status | Notes |
|---|---|---|
| 0. Capture current site | ✅ | wget mirror + Joomla tarball + MySQL dump in `../current/` |
| 1. Understand what to rebuild | ✅ | Documented in `inventory.md` |
| 2. Recreate styling | ✅ | Approach A (vendored YOOtheme CSS) validated by home-page spike |
| 3. Migrate content | ✅ | `scripts/migrate-from-joomla.mjs` + content collections + all 8 navigable pages ported |
| 4. Booking system | 🟡 | Schema, `/schedule`, booking form, endpoints and import script all built and tested locally. Blocked on: a fresh dump, and the Access application. |
| 5. Build + verify | 🟡 | Build passes; visual fidelity vs. live is close at desktop but mobile breakpoints unverified |
| 6. Cutover | ❌ | DNS still on Lightsail; cannot do this until Phase 4 ships |
| 7. Decommission | ❌ | Blocked on Phase 6 |

## What works

### Pages (all 8 navigable pages ported)
- `/` — hero, counter band, homesquares, sponsors
- `/teams` — age-group nav grid + per-age squad detail sections
- `/official-info` — welfare/safeguarding, FA respect, FA charter, committee
- `/membership` — image card + 4-card 2×2 grid; fees read from `site.json`
- `/resources` — 2 featured + 6 sectioned card groups
- `/contact-us` — committee + coordinator bands
- `/privacy-policy` — long-form markdown body
- `/terms-conditions` — long-form markdown body, fee corrected to 2025/26
- `/schedule` — public week view, server-rendered from D1
- `/schedule/book` — booking form + cancel list, behind Access

### Cloudflare wiring
- Account: set up
- GitHub repo: github.com/chrisrichards/littletonjuniorfc.com
- Worker: `littletonjuniorfc`, served at `littletonjuniorfc.yellowfeather.workers.dev`
- Workers Builds: connected to the repo, builds + deploys on every push to `main`
- **Not a Pages project** — `wrangler.jsonc` is a Worker-with-static-assets config (`main` +
  `assets`). `wrangler pages …` commands do not apply; the site does not appear in
  `wrangler pages project list`
- D1 database: `ljfc-bookings`, id `38d3059f-cb06-45e2-a38b-23641ea1d19d`
- D1 binding (`DB`) declared in `wrangler.jsonc`, which Workers Builds reads from the repo
- Cloudflare Access: **not yet configured**

### Content collections (`src/content.config.ts`)
- `pages/*.md` — long-form copy
- `teams.json` — 13 age groups × 45 squads with managers + emails
- `people.json` — 8 committee + 12 age-group coordinators
- `resources.json` — 38 entries × 7 sections
- `settings/site.json` — counters, fees, season, club info

### Vendored assets (under `public/`)
- `templates/yootheme/fonts/` — BebasKai + TradeGothic LT only (licensed for the domain — see `~/.claude/projects/.../memory/font-licensing.md`). All styling now lives in `src/styles/app.css`.
- `images/heros/`, `images/home/`, `images/contacts/`, etc.
- _(removed in the Tailwind migration: theme/custom/overrides.css, uikit\*.js, yootheme theme.js.)_

## 2026-09-02 — Phase 4: pitch bookings

Built against D1: `migrations/0001_bookings.sql`, `src/lib/{bookings,access,squads,dates}.ts`,
a public `/schedule` week view, an Access-gated `/schedule/book`, and `POST /api/bookings`
for create/cancel. These are the **first server-rendered routes** on the site; the other
eight pages stay prerendered.

- **Auth.** Cloudflare Access One-time PIN (the 44 manager addresses span 17 domains, so no
  single IdP fits). `src/lib/access.ts` verifies the `CF_Authorization` JWT against the Access
  certs endpoint rather than trusting `Cf-Access-Authenticated-User-Email`, which anything
  could set on a request that bypasses Access. Managers book for their own squads; the
  committee (from `people.json`) can book and cancel for anyone.
- **Times** are stored as local wall-clock `date` + `HH:MM`, not UTC instants — it mirrors the
  Joomla shape, makes overlap a string comparison, and removes DST conversion bugs.
- **No pitch sharing (decided 2026-09-02).** One team per pitch at a time —
  `maxConcurrentPerPitch: 1`, enforced in `src/lib/bookings.ts`. The rule cannot be a schema
  constraint: SQLite can't express interval exclusion, and an index on `start_time` would miss
  09:30-11:30 against 10:00-12:00. The **old data does not meet this rule** — 66 overlapping
  pairs in the 2025/26 season, 55 of them between different teams — so the import lists every
  one in `scripts/out/bookings-conflicts.csv`. Those need resolving by hand at import time;
  the app will refuse to create any new overlap.
- **Import.** `scripts/migrate-bookings.mjs` reads the Joomla dump and writes SQL; it never
  touches a database. Against the 2026-09-02 dump, cutoff 2026-09-01: **100 bookings kept**
  (2026-09-01 to 2027-04-11), 91 matched to a squad, 10 rejected, 0 pitch clashes.
  `scripts/out/bookings-review.txt` is the date-ordered list for the club.
- **Only `published = 1` rows are imported.** Joomla marks deleted bookings `-2` (trashed)
  and hidden ones `0`; the live site shows neither. Ignoring that column imported 15 deleted
  bookings, which resurrected slots the club had dropped and manufactured 4 clashes against
  bookings nobody holds — every clash in the first review pass was false. Caught by comparing
  the output against the live site's 6 September listing.
- `enddate` is frequently transposed (2025-12-01 ending 2025-01-12) and is ignored when it
  precedes the start, since dropping those rows would lose real bookings over a typo.
- **Verified locally:** 17 authorisation/validation cases (overlap, touching slots, squad
  ownership, admin override, non-allowlisted, past dates, opening hours, horizon, cancel
  permissions, rebooking a cancelled slot). The 8 existing pages are byte-identical to the
  pre-Phase-4 build apart from the CSS bundle's content hash, and the new CSS is provably
  additive (bundle minus `.sched*` rules == old bundle). `interact.mjs` ALL PASS.

### Blocked on

1. **A fresh `mysqldump`.** `../current/ljfc-db.sql` is from 2026-05-14 and contains exactly
   one booking on/after the 2026-09-01 cutoff (a 2028-09-09 row that looks like a typo).
   Nothing to import until the live Lightsail database is dumped again.
2. **The Access application** on `/schedule/book*` + `/api/bookings*`, with the One-time PIN
   allowlist from `allowlist()` in `src/lib/squads.ts`, plus `ACCESS_TEAM_DOMAIN` and
   `ACCESS_AUD` vars on the Worker.

## What's deferred / known issues

### Functional gaps (block public cutover)
1. **Pitch booking system.** Phase 4 entirely unbuilt. D1 schema not written, no booking endpoints, no Access policy, no manager UI.
2. **Legacy URL redirects.** `public/_redirects` is placeholders. Anyone hitting an old Joomla URL (`index.php?…`, `/component/users/*`) 404s.
3. **Cloudflare Access** allowlist not built. Will need to extract manager emails from the Joomla `_users` + `_user_usergroup_map` tables when wiring `/schedule/book`.

### Visual nits to polish (not blocking)
1. **Resources page** has a vertical gap in the Forms & Guides section between row 2 (Littleton Rec / Other Pitch Bookings) and row 3 (Incident Form / Expense Claims). Likely a `uk-grid-match` row-matching artifact.
2. ~~**Teams page** omits the collapsible squad-detail panels.~~ **Resolved
   (2026-06-03):** the `.hiddenbox` squad panels are collapsible (slide
   open/close via the teams.astro inline JS), and the live-site open state is
   now reproduced — opening a year group dims the other nav cards (disabled
   dark-grey, `.dim`), marks the open card `.notdim` (stays blue, hides its
   own "More" button), and shows a `.closeMe` × button top-right of the panel
   (`/images/close.png`). CSS in `app.css` ("Teams More open state").
3. **Contact-us page** omits the closing testimonial blockquote + bottom image present on the live site.
4. **Mobile breakpoints unverified** — CSS has them via `@media` but I haven't visually tested the ported pages on narrow widths.
5. **Resources featured cards** (Our Ethos + Player Development) use `uk-img` lazy loading. Visible in real browsers; headless screenshots may show blank cards.

### Data-quality issues (already fixed in code, documented here for context)
- **U10/U11 squad boundary**: source DB labels were wrong (5 vs 4 swap). Astros belongs to U11, not U10. Fixed in `scripts/migrate-from-joomla.mjs#applyTeamCorrections`.
- **U17 missing squads**: source labels said 2 squads but Legends + Rebels appear after Kings before U18 nav. Re-added in the same function.

### Decisions / workarounds worth knowing
1. **Approach A chosen** (vendor the YOOtheme CSS verbatim) over Approach B (rebuild with Tailwind). The home spike confirmed this gets to pixel-close fidelity in hours not days.
2. **Page-level overrides live in `public/templates/yootheme/css/overrides.css`**, NOT in `<style is:global>` Astro blocks. Astro's dev-mode HMR injection had cascade timing issues — moving to a plain CSS `<link>` made the cascade deterministic.
3. **Markdown image paths get rewritten** to absolute `/images/…` in the migration script. Astro otherwise tries to resolve relative paths against `src/` at load time and fails.
4. **Schedule article (id=1, alias `pitch-bookings`)** deliberately excluded from migration — that page is rebuilt against D1.
5. **Membership card alternation** (Our Subs dark / Joining Us blue / Paying Subs dark / Your Details blue) differs from `custom.css`'s rule (which would put 1+4 blue). Patched in `overrides.css` to match what the live site renders today.
6. **Nav alignment**: `.tm-header .uk-navbar-nav > li > a { align-items: flex-start; padding-top: 26px }` in overrides.css gives top-aligned text with the right gap below the white underline.

## What's next (suggested order)

### Pre-launch polish (1–2 hours total)
- [ ] Verify mobile breakpoints on every ported page (resize browser to ~375px / ~768px and screenshot)
- [ ] Fix the Resources Forms & Guides grid gap
- [ ] Add contact-us bottom image + testimonial
- [ ] Decide on `_redirects` policy for Joomla legacy URLs (e.g. `/index.php* → /`, `/component/*  → /`)

### Phase 4: booking system
- [ ] Write D1 schema (see migration-plan.md §4 for the proposed shape — bookings table)
- [ ] Extract manager email list from Joomla SQL: `SELECT email FROM josbg_users WHERE block = 0 AND id IN (SELECT user_id FROM josbg_user_usergroup_map WHERE group_id = X)`
- [ ] Configure Cloudflare Access self-hosted app on `/schedule/book` with email allowlist
- [ ] Build read-only `/schedule` showing existing bookings from D1
- [ ] Build `/schedule/book` with POST endpoint for creating bookings (Access-protected)
- [ ] Optionally migrate historical bookings (the plan suggests skipping; up to you)

### Phase 5–6: verify + cutover
- [ ] Full visual diff every page against live at desktop + mobile
- [ ] Lower DNS TTL on littletonjuniorfc.com 24h ahead of cutover
- [ ] Switch DNS to Cloudflare (low-traffic window, not Fri evening)
- [ ] Keep Lightsail running ~2 weeks as fallback
- [ ] Send Cloudflare Access onboarding instructions to managers

### Phase 7: decommission
- [ ] Final Lightsail backup
- [ ] Stop / delete the Lightsail instance
- [ ] Cancel the subscription

## Quick file reference

| Looking for | File |
|---|---|
| Original detailed plan | `migration-plan.md` |
| Page-by-page audit of the live site | `inventory.md` |
| Astro project instructions | `CLAUDE.md` (top of repo) |
| Cloudflare/wrangler config | `wrangler.jsonc` |
| Layout chrome + nav | `src/layouts/BaseLayout.astro` |
| Reusable hero | `src/components/Hero.astro` |
| Migration script | `scripts/migrate-from-joomla.mjs` |
| Content collection schemas | `src/content.config.ts` |
| Page-level CSS overrides | `public/templates/yootheme/css/overrides.css` |
| Font licensing memory | `~/.claude/projects/-Users-chris-code-ljfc-littletonjuniorfc-com/memory/font-licensing.md` |
| Content decisions memory | same dir, `content-decisions.md` |
