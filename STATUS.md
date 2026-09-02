# Project status

Last updated: 2026-09-02.

Living document — update this when something material changes (phase completes, decision made, blocker found). For the original detailed plan see [`migration-plan.md`](./migration-plan.md); for the page-by-page audit see [`inventory.md`](./inventory.md).

## TL;DR

Migration from Joomla to Astro on Cloudflare Workers (static assets, built by Workers Builds). Visitor-facing site is **content-complete and deployed** at https://littletonjuniorfc.yellowfeather.workers.dev, and as of 2026-09-02 has been **fully verified against the live site** — visual diff at 8 pages × 7 widths, plus links, images, PDFs, JS behaviour and head metadata. Four regressions found and fixed, including 27 PDF downloads that were 404ing. **Phase 5 is complete.** The pitch booking system (**Phase 4 is complete**) is deployed: Cloudflare Access is live with a 49-address One-time PIN allowlist, and 100 bookings are imported from 2026-09-01.

**DNS is not switched** — public littletonjuniorfc.com still serves the old Joomla site on AWS Lightsail. The one thing standing between here and cutover is the club resolving 10 review bookings (`scripts/out/bookings-review.txt`). Keystatic was never built and is deliberately deferred until after go-live.

## 2026-09-02 — Phase 5 close-out (links, PDFs, behaviour, metadata)

Worked through the rest of migration-plan.md's Phase 5 checklist, the part the
visual diff doesn't cover. One serious find.

**27 of 28 PDF downloads were 404ing** (fixed in `82d2063`). Two independent
causes, either of which alone would have broken most of them:

1. **The files were never migrated.** `public/images/downloads/` held exactly one
   PDF (the directory has since moved to `public/downloads/` — see Decisions #8).
   The other 27 were sitting in the wget capture at
   `../current/littletonjuniorfc.com/images/downloads/` and had never been copied
   across. 26 recovered from there; `Macron_bespoke_order_form_2024.pdf` is not in
   the capture (added to live after it was taken) and was pulled from live.
2. **Every `resources.json` href was relative** — `images/downloads/x.pdf` with no
   leading slash — so from `/resources/` they resolved to
   `/resources/images/downloads/x.pdf`. `official-info.astro` used absolute paths,
   which is why the safeguarding PDFs looked correct in the markup while the whole
   Resources set was broken.

Comparing every Resources card href against live also caught an **off-by-one**:
"Macron order form" carried the URL belonging to "Additional Kit", and
"Additional Kit" pointed at `#`. Both now match live.

**Everything else passed:**

| check | result |
|---|---|
| Internal links (52, incl. 28 PDFs) | 0 broken on workers.dev — the count covers the `/schedule` routes, which a local static server cannot serve |
| Old `/images/downloads/*` paths | 301 → `/downloads/*` (added when the PDFs moved) |
| Pages returning non-200 | none across all 9 routes |
| Images failing to decode | none |
| Teams "More" panel + close button | pass |
| Mobile drawer opens | pass |
| Home counters | 614 / 113 / 43 / 1 — identical to live |
| Favicon | ours resolve (200); live's paths differ but both work |
| Meta description | identical to live |
| Open Graph tags | **neither site has any** — parity holds; adding them would be an enhancement, not a fidelity fix |
| Access rejects a non-allowlisted address | pass — tested 2026-09-02 with a personal address in none of the three admin sources |
| App-side role gate (`roleFor()` → `none`) | pass — via the `astro dev` `?as=` shim |

**Page titles — decided 2026-09-02 to keep ours, not match live.** Live uses
`Littleton Junior FC - Teams`; we use `Teams | Littleton Junior FC`. Page-name-first
is the better convention for narrow tabs and search results. Home was the odd one
out (`Littleton Junior FC - Home`, matching live) and is now just
`Littleton Junior FC`, so all 11 routes are consistent. This is a deliberate
deviation from migration-plan.md's "page titles all match".

## 2026-09-02 — First visual diff against the live Joomla site

**This check had never actually been run.** The pixel-diff harness has always
compared the Astro site against *its own* earlier builds (a `main` / `fbcec00`
baseline), which catches refactor regressions but is blind by construction to
anything mis-ported from Joomla in the first place — those diffs are baked into
both sides. Shooting the live site and diffing against it is a different check.
It found three real regressions, all now fixed in `91ee803`.

**Method.** `shoot.mjs` takes a base URL, so no new tooling was needed:

```bash
node scripts/visual/shoot.mjs https://littletonjuniorfc.com               .visual/live
node scripts/visual/shoot.mjs https://littletonjuniorfc.yellowfeather.workers.dev .visual/new
node scripts/visual/diff.mjs  .visual/live .visual/new .visual/diff-live
```

Two gotchas worth keeping:

- **Live 403s any non-browser UA** ("Malware detected" — a Joomla firewall
  extension). `curl` needs a browser `-A`; Playwright's headless UA passes fine.
- **Live gates content behind an on-scroll fade.** A capture without
  `reducedMotion: 'reduce'` *and* a full autoscroll silently under-reports live's
  content — the first text comparison looked like live was missing half its
  cards. Both sides must scroll before you compare anything.

**A live diff never reaches 0/56, and shouldn't.** Images are AVIF/WebP
re-encodes by design, the social-icon placeholders and GA are deliberately
dropped, and the terms fee was intentionally updated. The signal is *layout* —
per-page height deltas and column counts — not the pixel percentage.

### Fixed (commit `91ee803`)

| | before | after | live |
|---|---|---|---|
| contact-us grid @768 | 2 cols | **4 cols** | 4 cols |
| official-info grid @768 | 2 cols | **4 cols** | 4 cols |
| `.contacts h4` transform | none | **uppercase** | uppercase |
| privacy/terms h1 top @375 | 274px | **74px** | 74px |
| contact-us page height @768 | +2914px | **+15px** | — |
| official-info @768 | +2259px | **−60px** | — |
| privacy-policy @375 | +220px | **+20px** | — |
| terms-conditions @375 | +243px | **+43px** | — |

1. **Grid breakpoint off by one step.** contact-us and official-info used
   `md:grid-cols-4`, but `md` is 960px while live's `uk-child-width-1-4@s` is
   **640px**. Across the whole 640–959 band those pages rendered 2 columns where
   live renders 4 — contact-us@768 was 4850px tall against live's 1936px. Both
   now use `min-[640px]:`, as `resources.astro` already did. (The 2026-06-03
   entry notes "the one `@s`=640 case uses `min-[640px]:`" — there were three,
   not one.)
2. **Action-card `h4` lost `text-transform: uppercase`.** Live renders
   "ETHU CRORIE" / "YEARS R-1"; we rendered "Ethu Crorie" / "Years R-1". Live
   applies it to the `.blue`, `.grey`, `.contacts` and `.offinfo4x4` variants
   alike, so the rule now covers all four.
3. **Privacy/terms banner was a flat 300px.** Live *swaps the source image*
   rather than scaling it — 100px below `@m`, 300px from `@m` up — so our h1 sat
   200px low at every width under 960. Now a media query; the h1 lands on live's
   exact y at all seven widths.

### Checked and deliberately not changed

**Teams squad counts.** Live's card labels disagree with live's *own* MORE
panels (it labels U10 "5 Squads" above a 4-squad panel). `teams.json` matches
the panels at all 13 age groups and its labels match its own arrays. This is the
already-documented `applyTeamCorrections` fix — see "Data-quality issues" below.
Live is stale here; we are right. The remaining roster differences
(Kites/Ospreys U14→U15, Sporting U15→U16, Torpedo U16→U17) are a season roll-up
for the club to confirm, not a porting bug.

### Residual differences (traced to a cause, not fixed)

- **official-info is ~510px taller than live at 375 and ~622px at 450.** The
  largest outstanding item. Live's card headings carry hard `<br/>`s and
  lowercase source text (`<h3>safeguarding<br/>guidance</h3>`,
  `<h3>fa<br/>safeguarding<br/>team</h3>`) plus empty `<p></p>` fillers; our port
  normalised all of that to single-line title case, which changes both the wrap
  and the look.
- **resources runs 75–140px short** at every width; **home runs 10px short**;
  **privacy is a flat +20px**. Not chased to a root cause.
- **terms-conditions**: every block matches to the pixel through y=636; the only
  difference is the intentionally-updated fee sentence (2019/20 £160 → 2025/26
  £200/£180) and the 20px it adds. The 6.5% pixel figure at 768 is an artifact
  of the page being only 900px tall.
- **Typography**: live uses curly apostrophes (`Association’s`) throughout
  official-info where ours are straight, and a non-breaking space in teams'
  "Year 2" (which prevents a wrap at narrow widths).
- **Copy fixes we made** that live still has wrong: `DOWLOAD`→`DOWNLOAD`,
  `anti-bulling`→`anti-bullying`, "ensure sure everyone"→"ensure everyone",
  "supporter"→"supporters".

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
| 2. Recreate styling | ✅ | Started as Approach A (vendored YOOtheme CSS); superseded 2026-06-02 by the UIkit→Tailwind migration. All CSS is now one hand-authored `src/styles/app.css`. |
| 3. Migrate content | ✅ | `scripts/migrate-from-joomla.mjs` + content collections + all 8 navigable pages ported |
| 4. Booking system | ✅ | Schema, `/schedule`, booking form, endpoints, roles and import all built and deployed. Access application live (One-time PIN, 49 addresses); 100 bookings imported from 2026-09-01. Two club-side follow-ups remain (below) — neither is engineering work. |
| 5. Build + verify | ✅ | Full visual diff against live (8 pages × 7 widths) plus links, images, PDFs, JS behaviour and head metadata all checked 2026-09-02. Four regressions found and fixed — three layout (`91ee803`), plus 27 broken PDF downloads (`82d2063`). |
| 6. Cutover | ❌ | DNS still on Lightsail. Phase 4 has shipped, so this is now gated only on the club resolving the 10 review bookings. |
| 7. Decommission | ❌ | Blocked on Phase 6 |

## What works

### Pages (8 navigable pages + 3 schedule routes = 11)
- `/` — hero, counter band, homesquares, sponsors
- `/teams` — age-group nav grid + per-age squad detail sections
- `/official-info` — welfare/safeguarding, FA respect, FA charter, committee
- `/membership` — image card + 4-card 2×2 grid; fees read from `site.json`
- `/resources` — 2 featured + 6 sectioned card groups
- `/contact-us` — committee + coordinator bands
- `/privacy-policy` — long-form markdown body
- `/terms-conditions` — long-form markdown body, fee corrected to 2025/26
- `/schedule` — public week view, server-rendered from D1
- `/schedule/book` — booking form, edit and delete, behind Access
- `/schedule/booking/<id>` — one booking; **public**, editable only for whoever may manage it

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
- Cloudflare Access: **live** over `/schedule/book*` + `/api/bookings*` — One-time PIN, 49 addresses

### Content collections (`src/content.config.ts`)
- `pages/*.md` — long-form copy
- `teams.json` — 13 age groups × 45 squads with managers + emails
- `people.json` — 8 committee + 12 age-group coordinators
- `resources.json` — 39 entries × 7 sections (General 2, Forms & Guides 6, Leagues 4, The FA 4, Coaching Tools 8, Venue Guides 10, Kit ordering 5)
- `settings/site.json` — counters, fees, season, club info
- `settings/bookings.json` — booking-system settings

### Vendored assets (under `public/`)
- `templates/yootheme/fonts/` — BebasKai + TradeGothic LT only (licensed for the domain — see `~/.claude/projects/.../memory/font-licensing.md`). All styling now lives in `src/styles/app.css`.
- `images/heros/`, `images/home/`, `images/contacts/`, etc.
- _(removed in the Tailwind migration: theme/custom/overrides.css, uikit\*.js, yootheme theme.js.)_

## 2026-09-02 — Phase 4: pitch bookings

Built against D1: `migrations/0001_bookings.sql`, `src/lib/{bookings,access,squads,dates}.ts`,
a public `/schedule` week view, an Access-gated `/schedule/book`, and `POST /api/bookings`
for create/update/delete. These are the **first server-rendered routes** on the site; the other
eight pages stay prerendered.

- **Auth.** Cloudflare Access One-time PIN (the 44 manager addresses span 17 domains, so no
  single IdP fits). `src/lib/access.ts` verifies the `CF_Authorization` JWT against the Access
  certs endpoint rather than trusting `Cf-Access-Authenticated-User-Email`, which anything
  could set on a request that bypasses Access. Managers book for their own squads; the
  committee (from `people.json`) can book and cancel for anyone. Extra admins who should not
  be named in this public repo go in the `ADMIN_EMAILS` secret on the Worker (comma-separated)
  rather than in `settings/bookings.json`.
- **Every booking on the schedule links to its own page** (`/schedule/booking/<id>`). That page
  is deliberately **outside** the Access-protected `/schedule/book*` path, because it hangs off
  the public schedule and has to be readable by anyone; it renders the edit form and a delete
  button only for whoever may manage that booking, and read-only otherwise. Access sets its
  cookie site-wide, so a manager who signed in at `/schedule/book` is recognised here without a
  second prompt; a manager who has not is offered a link that takes them through Access.
- **Managers edit and delete their own bookings; admins any.** `?edit=<id>` reloads the form
  against an existing booking, checked on the way in and again on submit. Delete is a soft
  cancel (`cancelled_at`), so the record of who booked what survives while the slot frees up
  immediately. Editing re-runs every rule a new booking faces, with the overlap check
  excluding the booking itself so moving one by 15 minutes does not collide with where it
  already is.
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

_Both original blockers — a fresh `mysqldump` and the Access application — are
resolved. The dump was taken, 100 bookings imported from 2026-09-01, and the
Access application is live over `/schedule/book*` + `/api/bookings*` with the
One-time PIN allowlist from `allowlist()` in `src/lib/squads.ts` (49 addresses),
plus `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` on the Worker._

What remains is club-side, not engineering:

1. **The 10 review bookings** (`scripts/out/bookings-review.txt`). Nine are Typhoons
   U13 — a team that books pitches but appears nowhere on the website, so those
   bookings have no manager email and only committee members can change them. The
   tenth is one booking made for two squads at once (U14 Vipers/Cobras).
2. **Whether Typhoons U13 joins `teams.json`** — needs Chris Howes's email address.

## What's deferred / known issues

### Deferred to after go-live
- **Keystatic CMS is not built.** No `keystatic.config.ts`, no `/keystatic` route,
  no dependency — it is in migration-plan.md's target stack but was never
  implemented. Decided 2026-09-02 that it does not gate go-live: content is
  edited by changing files in this repo, which is how it has been done
  throughout. Revisit once the site is live and a non-technical editor actually
  needs it.

### Functional gaps (block public cutover)
1. **10 bookings need a decision from the club** — `scripts/out/bookings-review.txt`. Nine are
   Typhoons U13, a team that books pitches but appears nowhere on the website, so those bookings
   have no manager email and only committee members can change them. The tenth is one booking made
   for two squads at once (U14 Vipers/Cobras).

_(Legacy URL redirects were here; they are now a closed decision — see
"Decisions / workarounds worth knowing".)_

_(Phase 4 and the Access application are done — see the 2026-09-02 entry above.)_

### Visual nits to polish (not blocking)
1. ~~**Resources page** has a vertical gap in the Forms & Guides section between row 2 (Littleton Rec / Other Pitch Bookings) and row 3 (Incident Form / Expense Claims).~~ **Resolved (verified 2026-09-02):** those are two separate grids and the gap between them matches live at every width (6px @1280, 5px @960, 5px @640); row pitch inside the first grid is 301px on both. Fixed at some point during the Tailwind work and never ticked off.
2. ~~**Teams page** omits the collapsible squad-detail panels.~~ **Resolved
   (2026-06-03):** the `.hiddenbox` squad panels are collapsible (slide
   open/close via the teams.astro inline JS), and the live-site open state is
   now reproduced — opening a year group dims the other nav cards (disabled
   dark-grey, `.dim`), marks the open card `.notdim` (stays blue, hides its
   own "More" button), and shows a `.closeMe` × button top-right of the panel
   (`/images/close.png`). CSS in `app.css` ("Teams More open state").
3. ~~**Contact-us page** omits the closing testimonial blockquote + bottom image present on the live site.~~ **Resolved (verified 2026-09-02):** the `.quoteimage` band renders at 572px on both live and ours, same "Stan has not only developed as a footballer…" quote.
4. ~~**Mobile breakpoints unverified**~~ **Resolved (2026-09-02):** all 8 pages diffed against live at 375/450/640/768/960/1024/1280. Three narrow-width regressions found and fixed; see the 2026-09-02 entry for the residuals.
5. **Resources featured cards** (Our Ethos + Player Development) use `uk-img` lazy loading. Visible in real browsers; headless screenshots may show blank cards.

### Data-quality issues (already fixed in code, documented here for context)
- **U10/U11 squad boundary**: source DB labels were wrong (5 vs 4 swap). Astros belongs to U11, not U10. Fixed in `scripts/migrate-from-joomla.mjs#applyTeamCorrections`.
- **U17 missing squads**: source labels said 2 squads but Legends + Rebels appear after Kings before U18 nav. Re-added in the same function.
- Both corrections were **re-confirmed independently by the 2026-09-02 live diff**: live’s own MORE panels agree with `teams.json`, and it is live’s card *labels* that are wrong.

### Decisions / workarounds worth knowing
1. **Approach A chosen** (vendor the YOOtheme CSS verbatim) over Approach B (rebuild with Tailwind). The home spike confirmed this gets to pixel-close fidelity in hours not days.
2. **Page-level overrides live in one hand-authored stylesheet, not in `<style is:global>` Astro blocks.** Astro's dev-mode HMR injection had cascade timing issues; a plain CSS `<link>` made the cascade deterministic. _(Originally `public/templates/yootheme/css/overrides.css`; since the 2026-06-02 Tailwind migration that file is gone and everything lives in `src/styles/app.css`.)_
3. **Markdown image paths get rewritten** to absolute `/images/…` in the migration script. Astro otherwise tries to resolve relative paths against `src/` at load time and fails.
4. **Schedule article (id=1, alias `pitch-bookings`)** deliberately excluded from migration — that page is rebuilt against D1.
5. **Membership card alternation** (Our Subs dark / Joining Us blue / Paying Subs dark / Your Details blue) differs from the old `custom.css` rule (which would put 1+4 blue). Reproduced in `src/styles/app.css` (`#membership > div > div:nth-child(…)`) to match what the live site renders today.
6. **Nav alignment**: the nav links use `align-items: flex-start` with a top padding so the text sits high with the right gap below the white underline. Now in `src/styles/app.css` (~line 1130).
7. **Legacy URL redirects: decided against (2026-09-02),** with one deliberate
   exception. Old Joomla paths (`index.php?option=com_…`, `/component/*`) will
   404 after cutover rather than 301 to `/`. This was previously logged as a
   cutover blocker; it is not one.
8. **PDFs moved to `/downloads/` (2026-09-02), and this one *is* redirected.**
   They were at `/images/downloads/`, inherited from Joomla putting every asset
   under `/images/`. `public/_redirects` carries a single rule —
   `/images/downloads/* /downloads/:splat 301`. Unlike the open-ended Joomla
   legacy patterns, these are 28 known files that get linked directly from
   emails and WhatsApp groups and are indexed by search engines, so the old
   paths have to keep working. Without the rule the move would have silently
   broken every shared link at cutover.

## What's next (suggested order)

### Pre-launch polish — done
- [x] Verify mobile breakpoints on every ported page — done 2026-09-02 via the live diff
- [x] Fix the Resources Forms & Guides grid gap — was already fixed; verified against live 2026-09-02
- [x] Add contact-us bottom image + testimonial — was already present; verified against live 2026-09-02
- [x] ~~Decide on `_redirects` policy for Joomla legacy URLs~~ **Decided 2026-09-02: skip them** (see Decisions #7)

Nothing outstanding here. The remaining Phase 5 work is the part of
migration-plan.md's checklist that has not been re-verified since the port:
PDFs reachable, mobile menu, counters, and Open Graph tags / favicon / page
titles. (Keystatic is deferred to after go-live — see "Deferred to after
go-live".)

### Phase 4: booking system — done
- [x] D1 schema (`migrations/0001_bookings.sql`), applied local and remote
- [x] Allowlist — taken from `teams.json` + `people.json`, not the Joomla users table, which held
      only 5 accounts and one shared `coach` login
- [x] Cloudflare Access application over `schedule/book`, `schedule/book/` and `api/bookings*`,
      One-time PIN, 49 addresses
- [x] Public `/schedule`, Access-gated `/schedule/book`, per-booking `/schedule/booking/<id>`
- [x] Create, edit and delete, scoped by role
- [x] 100 bookings imported from 2026-09-01 onwards
- [ ] Resolve the 10 review items with the club (`scripts/out/bookings-review.txt`)
- [ ] Decide whether Typhoons U13 should be added to `teams.json` (needs Chris Howes's email)

### Phase 5–6: verify + cutover
- [x] Full visual diff every page against live at desktop + mobile — done 2026-09-02 (`91ee803`); residuals listed in that entry
- [ ] Lower DNS TTL on littletonjuniorfc.com 24h ahead of cutover
- [ ] Switch DNS to Cloudflare (low-traffic window, not Fri evening)
- [ ] Keep Lightsail running ~2 weeks as fallback
- [ ] Send Access onboarding instructions to managers — they sign in with a one-time code emailed
      to the address the club holds for them; no password, no account to create

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
| All site CSS (one file) | `src/styles/app.css` |
| Visual regression harness | `scripts/visual/` (`shoot.mjs`, `diff.mjs`, `interact.mjs`, `measure.mjs`) |
| Font licensing memory | `~/.claude/projects/-Users-chris-code-ljfc-littletonjuniorfc-com/memory/font-licensing.md` |
| Content decisions memory | same dir, `content-decisions.md` |
