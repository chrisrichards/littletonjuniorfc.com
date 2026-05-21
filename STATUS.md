# Project status

Last updated: 2026-05-21.

Living document — update this when something material changes (phase completes, decision made, blocker found). For the original detailed plan see [`migration-plan.md`](./migration-plan.md); for the page-by-page audit see [`inventory.md`](./inventory.md).

## TL;DR

Migration from Joomla to Astro on Cloudflare Pages. Visitor-facing site is **content-complete and deployable** to the `*.pages.dev` preview URL. **DNS is not switched** — public littletonjuniorfc.com still serves the old Joomla site on AWS Lightsail. The pitch booking system (Phase 4) is unbuilt.

## Phase progress against migration-plan.md

| Phase | Status | Notes |
|---|---|---|
| 0. Capture current site | ✅ | wget mirror + Joomla tarball + MySQL dump in `../current/` |
| 1. Understand what to rebuild | ✅ | Documented in `inventory.md` |
| 2. Recreate styling | ✅ | Approach A (vendored YOOtheme CSS) validated by home-page spike |
| 3. Migrate content | ✅ | `scripts/migrate-from-joomla.mjs` + content collections + all 8 navigable pages ported |
| 4. Booking system | ❌ | D1 schema unwritten, Cloudflare Access not configured, no `/schedule` UI |
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
- `/schedule` — **placeholder only** ("coming soon")

### Cloudflare wiring
- Account: set up
- GitHub repo: github.com/chrisrichards/littletonjuniorfc.com
- Pages project: connected to repo, auto-deploys from `main`
- D1 database: `ljfc-bookings`, id `38d3059f-cb06-45e2-a38b-23641ea1d19d`
- D1 binding (`DB`) declared in `wrangler.jsonc` and in Pages dashboard
- Cloudflare Access: **not yet configured**

### Content collections (`src/content.config.ts`)
- `pages/*.md` — long-form copy
- `teams.json` — 13 age groups × 45 squads with managers + emails
- `people.json` — 8 committee + 12 age-group coordinators
- `resources.json` — 38 entries × 7 sections
- `settings/site.json` — counters, fees, season, club info

### Vendored assets (under `public/`)
- `templates/yootheme/css/theme.css` (393 KB, UIkit + YOOtheme)
- `templates/yootheme/css/custom.css` (39 KB)
- `templates/yootheme/css/overrides.css` — page-level rules we wrote
- `templates/yootheme/fonts/` — BebasKai + TradeGothic LT (licensed for the domain — see `~/.claude/projects/.../memory/font-licensing.md`)
- `templates/yootheme/vendor/.../uikit{,-icons}.min.js`
- `images/heros/`, `images/home/`, `images/contacts/`, etc.

## What's deferred / known issues

### Functional gaps (block public cutover)
1. **Pitch booking system.** Phase 4 entirely unbuilt. D1 schema not written, no booking endpoints, no Access policy, no manager UI.
2. **Legacy URL redirects.** `public/_redirects` is placeholders. Anyone hitting an old Joomla URL (`index.php?…`, `/component/users/*`) 404s.
3. **Cloudflare Access** allowlist not built. Will need to extract manager emails from the Joomla `_users` + `_user_usergroup_map` tables when wiring `/schedule/book`.

### Visual nits to polish (not blocking)
1. **Resources page** has a vertical gap in the Forms & Guides section between row 2 (Littleton Rec / Other Pitch Bookings) and row 3 (Incident Form / Expense Claims). Likely a `uk-grid-match` row-matching artifact.
2. **Teams page** omits the collapsible squad-detail panels from the live site — all squads render inline, "More" buttons anchor-scroll. Functional but visually denser than live.
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
