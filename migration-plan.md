# Littleton Junior FC — Joomla to Astro Migration Plan

## Target stack

- **Framework:** Astro
- **Hosting:** Cloudflare Pages
- **Database (bookings):** Cloudflare D1
- **Auth (bookings):** Cloudflare Access with email allowlist
- **CMS:** Keystatic (Git-based, stores content in GitHub repo)
- **Cost target:** £0/month (vs current ~£6/month on AWS Lightsail)

---

## Phase 0: Capture the current site

Do this first, before anything else. Get a complete snapshot — you'll thank yourself later.

**On the Lightsail server, grab:**

1. **The full filesystem** — `tar -czf ljfc-files.tar.gz /var/www/html/` (or wherever Joomla lives). This gets you templates, uploaded images, PDFs, the YOOtheme template files, custom CSS, everything.
2. **The MySQL database** — `mysqldump -u root -p joomla_db > ljfc-db.sql`. You'll mine this for content.
3. **The web server config** — nginx or Apache config, for any URL rewrites you might need to preserve.

**From the public site, grab a complete static mirror with `wget`:**

```bash
wget --mirror --convert-links --adjust-extension --page-requisites \
     --no-parent --wait=1 https://littletonjuniorfc.com
```

This gives you a local copy of the rendered HTML and all CSS/JS/images as they appear in the browser. Critical for the "matches exactly" requirement — this is your reference.

Also save the rendered HTML of each page individually (view source) so you can diff against your Astro output later.

---

## Phase 1: Understand what you're rebuilding

Joomla + YOOtheme is more involved than it looks. Specifically:

- **YOOtheme Pro** is a page builder — content isn't just in articles, it's structured into sections/columns/elements stored as JSON in template params. You'll need to manually translate this into Astro components.
- **Pitch Booker** (the booking component, visible at the bottom of every page) is a third-party Joomla extension. This is the thing you're replacing with D1 + Cloudflare Access.
- **Joomla user accounts** are stored in the `_users` table. The bookings will reference these. You'll need to extract the list of authorised managers' emails for the Cloudflare Access allowlist.
- **Articles** — the actual page text content lives in the `_content` table. Mostly straightforward HTML.
- **Menus** — `_menu` table. Defines the navigation structure.

Take an inventory pass and write down, page by page:

- URL
- Page template/layout used
- Where the content comes from (article? YOOtheme builder? menu module?)
- Any dynamic elements (counters, galleries, forms)

For this site that's roughly: Home, Teams, Official Info, Membership, Resources, Contact Us, Privacy, Terms, Schedule. So ~9 pages. Manageable.

---

## Phase 2: Recreate the styling exactly

This is where most Joomla→Astro migrations come unstuck, so be deliberate.

### Two approaches

**Approach A: Copy the CSS verbatim.** Grab the compiled YOOtheme CSS from the live site (it's a single file in `templates/yootheme/cache/` or similar). Drop it into your Astro project as `src/styles/global.css`. Use the same class names in your Astro components as YOOtheme emits in its HTML.

- Pros: pixel-perfect, fast.
- Cons: you've inherited a ~200KB CSS file with hundreds of classes you don't need, and the code is opaque.

**Approach B: Rebuild with Tailwind (or vanilla CSS), matching visually.** Look at the live site, identify the design tokens (colours, fonts, spacing scale), build components from scratch in Astro.

- Pros: clean, maintainable, smaller payload.
- Cons: more work, and "exactly matches" becomes a manual comparison job.

### Recommended pragmatic path

Start with Approach A for the migration, then refactor toward B over time if you want:

1. Run the live site through a tool that extracts the actual rendered CSS for each page. Use Chrome DevTools' "Coverage" tab to see exactly which CSS rules are used on each page, or use a tool like `purgecss` against your wget'd HTML to strip unused styles from the YOOtheme CSS bundle.
2. Drop the (now-reduced) CSS into Astro.
3. Replicate the HTML structure in your Astro components, using the same classes the original site uses.
4. Diff visually page by page using a tool like BackstopJS or Playwright screenshots — Approach A makes it realistic to get to "pixel-identical" because you're using the exact same styles.

### Don't forget fonts

Check the network tab on the live site, note the font files being loaded, and host them yourself (or use the same CDN). Font mismatches are the #1 cause of "it looks slightly off but I can't tell why."

### One specific gotcha

YOOtheme uses UIkit as its underlying framework. A lot of the classes you see (`uk-flex`, `uk-grid`, etc.) are UIkit utility classes. You can either keep UIkit (just include their CSS), or replicate the styles. Including UIkit is the pragmatic move for a "must match exactly" migration.

---

## Phase 3: Migrate content

Having the database is gold. Write a one-off script (Node or Python) that:

1. Connects to the MySQL dump (or imports it into a local MySQL/SQLite first)
2. Reads each article from `_content`
3. Strips out Joomla-specific markup (`{loadmoduleid 123}` plugin syntax, etc.)
4. Converts the HTML to Markdoc/Markdown
5. Writes a `.mdoc` file into `src/content/pages/` with the right frontmatter

Rough sketch:

```javascript
import mysql from 'mysql2/promise';
import TurndownService from 'turndown';
import fs from 'fs/promises';
import path from 'path';

const turndown = new TurndownService({ headingStyle: 'atx' });

const db = await mysql.createConnection({ /* ... */ });
const [articles] = await db.execute(
  "SELECT id, title, alias, introtext, fulltext_ FROM joomla_content WHERE state = 1"
);

for (const article of articles) {
  const html = article.introtext + article.fulltext_;
  const cleaned = html
    .replace(/\{loadmoduleid \d+\}/g, '')  // strip Joomla module syntax
    .replace(/\{[^}]+\}/g, '');             // strip other Joomla tags

  const markdown = turndown.turndown(cleaned);
  const frontmatter = `---\ntitle: ${JSON.stringify(article.title)}\n---\n\n`;

  await fs.writeFile(
    path.join('src/content/pages', `${article.alias}.mdoc`),
    frontmatter + markdown
  );
}
```

For YOOtheme builder content, you'll need a different approach — inspect the page in the browser, look at the rendered HTML, and rebuild it as an Astro component with the content extracted manually. There's no clean automated path because YOOtheme stores layouts as a JSON blob.

**Images and PDFs:** copy everything under `/images/` and `/templates/yootheme/cache/` from the server into `public/uploads/` in your Astro project. Then write a regex pass over your migrated content to rewrite image paths.

**URLs:** check the database `_menu` table to confirm the live URL structure. If you want to preserve URLs exactly (recommended for SEO and bookmarks), your Astro page filenames need to match.

---

## Phase 4: Migrate the booking data

The current Pitch Booker stores bookings somewhere in MySQL (table name depends on the extension, look for tables prefixed with `_pitchbooker_` or similar).

For each existing booking:

1. Read pitch, team, manager, start/end time
2. Map manager → email (join with `_users` table)
3. Insert into D1 with the schema below

You might also choose **not** to migrate historical bookings and just start fresh from the cutover date. For a pitch booking system, past bookings have no functional value. Cleaner.

### D1 schema

```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pitch TEXT NOT NULL,          -- 'nursery' | 'top' | 'middle' | 'bottom'
  team TEXT NOT NULL,           -- 'Ospreys U14'
  manager_email TEXT NOT NULL,  -- from Cf-Access header
  manager_name TEXT NOT NULL,   -- display name, set in profile or derived
  start_time TEXT NOT NULL,     -- ISO 8601
  end_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bookings_start ON bookings(start_time);
```

You'll want a uniqueness check to prevent double-booking the same pitch at the same time — easiest as a query before INSERT, or a more sophisticated SQL constraint if you want belt-and-braces.

### Extract the manager email list

While you're in the database — this becomes your Cloudflare Access allowlist:

```sql
SELECT email FROM joomla_users WHERE block = 0 AND id IN (
  SELECT user_id FROM joomla_user_usergroup_map WHERE group_id = X  -- manager group
);
```

---

## Phase 5: Build and verify

Build the Astro site, deploy to Cloudflare Pages on a preview URL (e.g. `preview.littletonjuniorfc.com` or just the default `*.pages.dev` URL Cloudflare gives you).

### Verification checklist

- [ ] Visual diff every page against the live site at desktop and mobile widths
- [ ] All internal links work
- [ ] All images load
- [ ] All PDFs are accessible
- [ ] Contact form works (you'll need a solution for this — Cloudflare Pages doesn't run PHP; use a service like Formspree, or a Worker that emails via Resend/Postmark)
- [ ] Schedule renders correctly with migrated bookings
- [ ] Authorised managers can log in via Cloudflare Access and create bookings
- [ ] Non-authorised emails get rejected by Access
- [ ] Keystatic editor works for at least one of your content editors
- [ ] Mobile menu works
- [ ] Counters/stats display correctly
- [ ] Open Graph tags, favicon, page titles all match

### Things that often break and aren't obvious

- Joomla's `index.php?option=com_...` legacy URLs — anyone with bookmarks
- Email links (the site uses `mailto:` obfuscation via "Email address protected from spambots")
- Form submissions (no PHP backend anymore)
- Any embedded Joomla modules or plugins on pages that aren't replicated

For legacy URLs, set up redirects in Cloudflare Pages `_redirects` file:

```
/component/users/* /  301
/index.php /  301
```

---

## Phase 6: Cutover

Once the preview site looks identical and works correctly:

1. **Lower the DNS TTL** on the current `littletonjuniorfc.com` records to 5 minutes, at least 24 hours before cutover. This lets you switch back quickly if needed.
2. **Schedule the cutover for a low-traffic window** — probably a weekday morning, definitely not a Friday evening before matches.
3. **Final database sync** — re-run the booking migration against the latest data, since people may have made bookings since your first migration.
4. **Switch DNS** to point at Cloudflare Pages. Use Cloudflare as your nameservers if not already.
5. **Keep the Lightsail server running for ~2 weeks** before tearing it down. Cheap insurance.
6. **Add Cloudflare Access** to the manager accounts and send them onboarding instructions.

---

## Phase 7: Decommission

After two weeks of the new site running cleanly:

- Take a final backup of the Lightsail instance
- Stop the instance (or delete it)
- Cancel the Lightsail subscription
- Done

---

## Realistic time estimate

Doing this carefully, expect:

| Phase | Effort |
|-------|--------|
| 0–1: Capture + inventory | Half a day |
| 2: Styling | 1–2 days (more if YOOtheme proves stubborn) |
| 3: Content | 1 day with the script approach (more if lots of YOOtheme builder pages) |
| 4: Bookings | Half a day |
| 5: Build + verify | 1–2 days |
| 6: Cutover | A couple of hours plus monitoring |

**Total: 5–8 days of focused work**, spread over however long you want. Not a weekend project, but very achievable as evening/weekend work over a month or two.

---

## One specific recommendation about styling

Before you commit to the whole migration, do this in one evening:

1. Stand up an empty Astro project
2. Copy the YOOtheme CSS bundle into it
3. Try to recreate just the homepage hero section

If you can get it pixel-identical in an hour or two, the whole migration is viable. If you find yourself fighting the CSS, you've discovered the risk early and cheaply, and you can decide whether to rebuild styles from scratch (more work, cleaner result) or use a different approach altogether.

---

## Repository structure (for reference)

```
littletonjuniorfc/
├── public/
│   ├── favicon.svg
│   ├── ljfc-logo.png
│   └── downloads/
│       └── Club_Ethos_2021_pb3.pdf
├── src/
│   ├── content/                    # ← All editable content lives here
│   │   ├── config.ts
│   │   ├── pages/
│   │   │   ├── home.mdoc
│   │   │   ├── teams.mdoc
│   │   │   ├── official-info.mdoc
│   │   │   ├── membership.mdoc
│   │   │   ├── resources.mdoc
│   │   │   └── contact-us.mdoc
│   │   ├── teams/
│   │   │   ├── ospreys-u14.mdoc
│   │   │   ├── eagles-u14.mdoc
│   │   │   └── ...
│   │   └── settings/
│   │       ├── site.json
│   │       └── navigation.json
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   └── TeamCard.astro
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro             # /
│   │   ├── teams/
│   │   │   ├── index.astro         # /teams
│   │   │   └── [slug].astro        # /teams/ospreys-u14
│   │   ├── official-info.astro
│   │   ├── membership.astro
│   │   ├── resources.astro
│   │   ├── contact-us.astro
│   │   ├── schedule/
│   │   │   ├── index.astro         # /schedule  (public read-only view)
│   │   │   └── book.astro          # /schedule/book  (protected by Access)
│   │   ├── api/
│   │   │   ├── bookings.ts         # POST/GET bookings (uses D1)
│   │   │   └── bookings/[id].ts    # DELETE a booking
│   │   └── keystatic/
│   │       └── [...params].astro   # Mounts the Keystatic UI
│   ├── lib/
│   │   ├── db.ts                   # D1 helpers
│   │   └── auth.ts                 # Reads Cf-Access-Authenticated-User-Email
│   └── styles/
│       └── global.css
├── keystatic.config.ts             # ← Keystatic schema
├── astro.config.mjs
├── wrangler.toml                   # Cloudflare Pages + D1 binding
├── package.json
└── tsconfig.json
```
