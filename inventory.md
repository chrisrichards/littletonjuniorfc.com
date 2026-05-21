# Site inventory

Source: wget mirror at `/Users/chris/code/ljfc/current/littletonjuniorfc.com/` (captured 2026-05-15).

## Shared chrome (every page)

Every page shares the same skeleton:

- **Mobile header** (`.tm-header-mobile`, `uk-hidden@m`): centred logo + hamburger that opens a UIkit off-canvas drawer (`#tm-mobile`) containing the same 6-item nav as desktop, one item per line.
- **Desktop header** (`.tm-header`, `uk-visible@m`): centred logo with **3 nav items either side** — left: Home, Teams, Official Info — right: Membership, Resources, Contact Us. Each label uses a `<br/>` to wrap to two lines, e.g. "Official\nInfo". The active item gets `.uk-active`.
- **Hero band** (`#page#1.hero`): full-bleed responsive image, with `margin-top: -246px` so the hero tucks under the header. Inner pages add a `.headerText` h1 overlay plus three social icons (Facebook, Twitter, Pinterest — placeholder hrefs `https://facebook.com` etc., not real club accounts) in the bottom-left.
- **Footer** (`#footer#4`): single line — `© Littleton Junior Football Club | Privacy | Terms`. Background `#464547`, white text, 15px/38px padding.
- **Pitch Booker popup** (`.rstboxes #rstbox_1`): the EngageBox modal is included on *every* page, triggered by clicking any element with id `#bookpitch`. The popup loads `administrator/index.php?option=com_jux_timetable&view=events` in an iframe — this is the part we're replacing with D1 + Cloudflare Access. **Important: only the schedule page actually has a `#bookpitch` trigger button; the popup markup on other pages is inert.**
- **Google Analytics** (`G-TCWH62LNZ9`) loaded in every `<head>`. Decision to make: keep, switch to Cloudflare Web Analytics (privacy-friendly, free), or drop entirely.

### Vendored CSS/JS (referenced from every page)

| File | Size | Notes |
|---|---|---|
| `templates/yootheme/css/theme.9.css` | 393 KB | Compiled YOOtheme bundle. Includes UIkit. |
| `templates/yootheme/css/custom.css` | 39 KB | Project-specific overrides — fonts, colours, custom selectors against `#page#N` ids. |
| `media/com_rstbox/css/engagebox.css` | — | EngageBox popup styles. Drop with the popup. |
| jQuery 1.x + migrate, Velocity, EngageBox JS, UIkit JS, theme.js | — | All needed for the current page; some replaceable. |

UIkit is the foundation — heavy reliance on `uk-grid`, `uk-card`, `uk-section-default`, `uk-margin-*`, `uk-child-width-*@m`, `uk-filter`, `uk-scrollspy`, `uk-img` (lazy-loading), `uk-offcanvas`, `uk-navbar`.

### Fonts

Two custom families:

- **BebasKai** (display — large numbers, headings) — `templates/yootheme/fonts/3A11AF_0_0.{woff2,woff,ttf,eot,svg}`. The `3A11AF` hash is a Fonts.com / Monotype-style ID; **licensing needs confirming before we re-host**.
- **TradeGothic LT** (body) — `templates/yootheme/fonts/TradeGothicLT.{woff2,woff}`. Linotype font, **also needs licence confirmation**.

If licences don't transfer, swap to free alternatives: e.g. **Bebas Neue** (Google Fonts) for BebasKai, and **Roboto Condensed / Barlow Condensed** for TradeGothic LT. We can build with the licensed fonts in `public/fonts/` and stub free alternatives behind a feature flag if needed.

### Colour palette (extracted from inline styles)

- `#5da9dd` — accent blue (headings, primary buttons)
- `#464547` — dark grey (footer, secondary background)
- `#fff` — white (text on dark backgrounds, light cards)
- Card variants: `uk-card-primary` (blue), `uk-card-secondary` (dark) — exact hex set by YOOtheme.

### Email obfuscation

Joomla's "cloak" pattern is everywhere — emails are emitted as `<span id="cloak{md5}">` placeholder + an inline JS that builds the `mailto:` link character-by-character. **60 instances on contact-us.html alone, dozens more on teams.html.** When we migrate we should just emit clean `mailto:` links and rely on Cloudflare's bot mitigation if scraping is a real concern. Document this decision in the contact page work.

### YOOtheme ids in CSS

Custom CSS uses selectors like `#page\#1`, `#page\#8`, `#footer\#4` — those `#N` ids come from YOOtheme's page builder structure. They'll vanish when we rebuild in Astro, so any rule keyed on them needs to be rewritten against new selectors. The custom CSS file will require deliberate pruning.

---

## Page-by-page

### 1. `/` (index.html, 29 KB)

**Layout:** standard chrome + 5 sections.

**Sections, in order:**

1. **Hero image** (`Home_banner-*.jpeg`) — full bleed, no overlay text.
2. **Counters band** (4 cards, blue `uk-card-primary`): `614 players`, `113 coaches`, `43 teams`, `1 club`. Numbers count up from 0 on page load via inline JS targeting `.counter[data-count]`.
3. **Homesquares grid** (8 cards, dark `uk-card-secondary`) — alternating text/image: *Origins / image / Ethos / image / Coaching / image / Location / image*. One card (`data-tag="Download"`) is the "Read more — Club Ethos PDF" link. Uses `uk-filter` so "All" / "Download" tabs filter — but with only one taggable card this is mostly decorative.
4. **Sponsors band** (4 cards) — currently only one populated (Saints Foundation), three placeholders using `grey_box-*.jpeg`.
5. **Two empty `uk-section`s** (`#page#17`, `#page#20`) — looks like leftover slots in the YOOtheme builder.

**Dynamic bits:** counters (one-shot animation), `uk-filter` on the homesquares and sponsors bands, `uk-scrollspy` fades-in.

**Migration note:** counters become a small Astro component reading numbers from `src/content/settings/site.json`. The filter tabs add UX value only if there are multiple tags — currently they don't, so we can simplify.

---

### 2. `/teams.html` (131 KB, 4734 lines, 163 cards)

This is the biggest, most structured page.

**Sections:**

1. Hero + "Teams" headerText + socials.
2. **Age-group grid** (`#u6-9`, `#u10-13`, `#u14-17`, `#u18-pan`): four bands of 4 cards each, one card per age group (U6, U7, …, U18 + "Pan-disability" implied by `#pan`). Each card shows the age, number of squads or "Year N" label, and a "More" button that scrolls to a hidden section.
3. **Hidden squad detail panels** (`#u6`, `#u7`, …, `#u18`, `#pan` — one per age group): the panel only appears via inline jQuery that adds/removes a `.dim` class on siblings and slides the panel in. Each panel is a 4-column grid of cards listing **squads + manager + email** for that age group.

**Squad list (extracted from h2s):**

- U6: Nursery
- U7: Nursery
- U8: Hornets, Raptors, Sabres, Thunderchiefs
- U9: Lions, Nitros, Panthers, Raiders
- U10: Jaguars, Leopards, Scorpions, Wolves
- U11: Astros, Cosmos, Jets, Rockets, Titans
- U12: Avalanche, Cyclones, … *(plus more — full list is in the HTML, count was 58 named squad cards total)*
- U13–U18: similar pattern

**Dynamic bits:** the `openClose(child, id, extra)` inline-JS dance to slide hidden panels open is YOOtheme-builder-specific and rebuilt-from-scratch territory.

**Migration note:** this is a clear case for a **content collection**. Create `src/content/teams/<age>-<squad-slug>.mdoc` (or one entry per age group with a list of squads), define a schema with `age`, `squad`, `manager_name`, `manager_email`, optional `notes`, and render with a single Astro template that mirrors the visual structure. Manager emails should come from the Joomla DB, not the HTML mirror (the HTML versions are obfuscated). 60 cloak spans suggests we have most/all manager emails recoverable via the SQL dump.

---

### 3. `/official-info.html` (52 KB, 32 cards, 33 headings)

**Sections:**

1. Hero + headerText "Official Info".
2. **Welfare and safeguarding** band — intro text (A safe environment / Child or young person / Responsibility / Whistle blowing) + cards for *Club Welfare (Adam Stacey)*, *County (Mel Gill)*, *FA*, *Childline*, *NSPCC*, *safeguarding (x2)*, *Equality*, *Anti-bullying*, *Complaints*. Mix of email cards (`data-tag="Email"`), link cards (`data-tag="Visit"`), and download cards (`data-tag="Download"`).
3. **FA Respect codes** band — cards for *young players*, *spectators and parents*, *coaches*, *match officials*.
4. **FA Charter** band — card for *charter standard website*.
5. **The Committee** band — list of committee roles & names (mirrored on contact-us).

**Migration note:** all content is short labels + a link/email/PDF action. Map to a collection of "info card" entries with `{ title, body, action: 'email' | 'visit' | 'download', target, tags[] }` and render with a generic card component.

---

### 4. `/membership.html` (21 KB)

**Sections:**

1. Hero + headerText "Membership".
2. **Two-column band** — left column has a single image card (`membershipblock-*.jpeg`); right column has 4 cards in a 2×2 grid: *Our Subs* (fees text), *Joining us*, *Paying Subs* (Pitchero link), *Your details* (Pitchero link). Filter tabs: All / PAY SUBS / See Your Details.

**Migration note:** simplest page. Single Markdoc file plus a couple of action cards.

---

### 5. `/resources.html` (58 KB, 40 cards)

**Sections (each is a labelled grouping):**

1. Hero + headerText "Resources".
2. *Forms & Guides* — Ethos, Player Development, Membership, DBS checks, Littleton Rec bookings, Other pitch bookings, Incident Form, Expense Claims.
3. *Leagues* — EDMSL, Tyro, Testway, CSYFL.
4. *The FA* — THE FA, Whole Game System, Full Time, Anti-bullying policy.
5. *Coaching Tools* — The Coaching Manual, SoccerXpert, Footy4kids, Soccer Coach Weekly, The Boot Room.

Each card has tag `Download` / `Visit` / `Link` / `dowload` (sic — typo in source). Mix of PDF links (under `images/downloads/`) and external links.

**Migration note:** same shape as official-info — a "resource link" collection.

---

### 6. `/contact-us.html` (53 KB, 20 cards, 60 cloaked emails)

**Sections:**

1. Hero + headerText "Contact Us".
2. **Committee** — Chairman (Ethu Crorie), Treasurers (Stephen Porter), Development Officer (Simon Fletcher), Secretary (Mike Knowles), Welfare (Adam Stacey), Vice Chair facilities & coaches (Paul Burgess), Vice chair (Sean McPike), Parish Council Liaison (Ian Davies).
3. **Age-group coordinators** — one card per age group (U6 through U18), each with a name + cloaked email and a `data-tag="Email"`.

**Migration note:** strong case for a `src/content/settings/people.json` (or a `committee` collection). One source of truth for names + emails; reused on contact-us, teams, official-info.

---

### 7. `/schedule.html` (23 KB) — **most affected by migration**

**Sections:**

1. Hero (using `teams-*.jpeg` — note: reuses the Teams hero image, headerText shows "Pitch Bookings").
2. A `.calendarsection` containing just:
   - A `#bookpitch` button styled as `uk-button uk-button-large` ("Book Pitch") with a calendar icon.
   - The `jf_login` widget (`mod_jf_login`) — a Joomla login modal with username/password fields, "Remember Me", and a pretext explaining where to get login details (cloaked email to *paul@burgeagency.com*).
   - A "Components Anywhere" placeholder that errored on capture: `CURL Error: SSL: no alternative certificate subject name matches target host name 'webdisk.littletonjuniorfc.com'` — this slot would have been the embedded calendar but wget couldn't reach it.

**The actual calendar view is missing from the mirror.** It's served from `administrator/index.php?option=com_jux_timetable&view=events` inside the EngageBox iframe, and that admin path isn't accessible to anonymous wget. We have no rendered reference for the booking UI.

**Migration plan implication:**

- The booking UI must be built from scratch — there's no "match this design pixel-perfect" reference for the schedule view itself. That's fine; it'd have been the worst page to faithfully reproduce anyway.
- We should probably ask the user for screenshots of the existing booking flow (or a session against the live admin) before designing the replacement.
- The login modal goes away entirely: Cloudflare Access handles auth.

---

### 8. `/privacy-policy.html` (33 KB)

Straight long-form legal copy under headings *1. About this Policy* through *18. Changes to this policy* (with #11 missing — likely renumbered when edited). Plain prose, no dynamic elements.

**Migration note:** single Markdoc file. Easiest page to migrate.

---

### 9. `/terms-conditions.html` (17 KB)

Short legal page: 2 intro paragraphs + a *Terms and Conditions* section with 5 bullet rules. Note the fee figure quoted there (£160 for 2019/20) is stale relative to membership.html (£200 for 2025/26) — content drift to flag to the user.

---

## Cross-cutting findings

### Things that will need work

1. **Pitch Booker is gone.** Phase 4 in the migration plan — D1 schema + Cloudflare Access + a new Astro `/schedule` page. Booking-list rendering and create/cancel UI all built fresh.
2. **No PHP backend.** Affects:
   - `mod_jf_login` modal on `/schedule` — replaced by Cloudflare Access.
   - Email cloaking JS — replace with plain `mailto:` (decide policy with user).
   - "Components Anywhere" calendar embed — replaced by D1-backed view.
3. **Social links are placeholders** — `https://facebook.com`, `https://twitter.com`, `https://pinterest.com`. Get real URLs from the user, or drop the row.
4. **Stale content drift** — terms-conditions mentions £160 for 2019/20; membership says £200 for 2025/26. Flag both for the user to confirm.
5. **Font licensing** — BebasKai and TradeGothic LT are commercial fonts. Confirm the license covers the new self-hosting on Cloudflare or swap for free equivalents.
6. **Google Analytics presence** — decide: keep GA, switch to Cloudflare Web Analytics, or drop.

### URL preservation list

These are the URLs to keep working (paths in the live Joomla don't include `.html` — but wget added the extension when mirroring). The Astro routes should be:

| Live URL | Astro page | Mirror file |
|---|---|---|
| `/` | `src/pages/index.astro` | `index.html` |
| `/teams` | `src/pages/teams.astro` (or `teams/index.astro`) | `teams.html` |
| `/official-info` | `src/pages/official-info.astro` | `official-info.html` |
| `/membership` | `src/pages/membership.astro` | `membership.html` |
| `/resources` | `src/pages/resources.astro` | `resources.html` |
| `/contact-us` | `src/pages/contact-us.astro` | `contact-us.html` |
| `/schedule` | `src/pages/schedule/index.astro` (public read) + `schedule/book.astro` (Access-protected) | `schedule.html` |
| `/privacy-policy` | `src/pages/privacy-policy.astro` | `privacy-policy.html` |
| `/terms-conditions` | `src/pages/terms-conditions.astro` | `terms-conditions.html` |

Joomla legacy URLs to redirect in `public/_redirects`:

```
/index.php           /                  301
/component/users/*   /                  301
/component/*         /                  301
```

(Worth checking server logs once we have access to the Lightsail instance to find any other legacy paths in active use.)

### Shared content sources to set up

- `src/content/settings/site.json` — title, GA id, social URLs, counters (players/coaches/teams), current fee structure.
- `src/content/settings/navigation.json` — main nav split into "left" and "right" arrays for the desktop layout.
- `src/content/people.{json|collection}` — committee + age-group coordinators with `{ name, role, email, ageGroup? }`. Joined onto teams/contact/official-info pages.
- `src/content/teams/*.mdoc` — one entry per squad with `{ age, squad, manager_name, manager_email, year_label? }`.
- `src/content/pages/*.mdoc` — long-form copy for index sections, privacy, terms, and any per-page narrative.

### Build order recommendation

1. Shared layout + header/footer/nav, palette, fonts.
2. Privacy + terms (lowest risk, validate the pipeline).
3. Membership + resources (medium — single-content pages with action cards).
4. Contact-us + official-info (uses the people collection).
5. Teams (depends on teams + people collections; biggest page).
6. Home (counters component + ethos cards).
7. Schedule — needs Cloudflare Access + D1 wired up; built from scratch.
