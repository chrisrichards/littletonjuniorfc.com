# Littleton Junior FC website

Migration of [littletonjuniorfc.com](https://littletonjuniorfc.com) from Joomla on AWS Lightsail to Astro on Cloudflare Workers. See [`migration-plan.md`](./migration-plan.md) for the full plan.

## Stack

- **Astro** (static + server endpoints via the Cloudflare adapter)
- **Cloudflare Workers** (static assets) — hosting, built by Workers Builds
- **Cloudflare D1** — pitch bookings database
- **Cloudflare Access** — email allowlist auth for booking managers
- **Keystatic** — Git-based CMS (to be added)

## Local development

```sh
npm install
npm run dev          # http://localhost:4321
npm run build        # build to ./dist
npm run preview      # preview the production build
```

## Project layout

```
public/              # static assets, _redirects, images, downloads
src/
  content/           # editable content (markdoc) — populated during migration
  components/        # Astro components
  layouts/           # page layouts
  pages/             # routes
  lib/               # D1 helpers, auth helpers
  styles/            # global CSS
wrangler.jsonc       # Cloudflare config (Worker + assets + D1 bindings)
astro.config.mjs     # Astro config
```

## Deployment

This is a **Worker with static assets**, not a Pages project — `wrangler.jsonc` has `main`
(the Worker entrypoint) plus `assets` (the prerendered site), which is what the Astro
Cloudflare adapter emits. Pages-specific commands (`wrangler pages …`) do not apply here.

| | |
| --- | --- |
| Worker name | `littletonjuniorfc` |
| Deployed URL | https://littletonjuniorfc.yellowfeather.workers.dev |
| Build | Workers Builds, connected to `github.com/chrisrichards/littletonjuniorfc.com` |
| Build command | `npm run build` |
| D1 | `ljfc-bookings`, bound as `DB` |

### Prerequisites

- Node `>=22.12.0` (see `engines` in `package.json`)
- Access to the Cloudflare account that owns the `littletonjuniorfc` project
- `npx wrangler login` (one-off, for manual deploys and D1 commands)

### Normal path — push to `main`

**Workers Builds** watches the repo and builds + deploys on every push to `main`. Nothing to
run locally. The build happens on Cloudflare's Linux builders, so its `sharp` differs from a
macOS one — the emitted AVIFs are a few hundred bytes off a local build's while being
visually identical. HTML and CSS come out byte-identical.

**DNS is not switched** — `littletonjuniorfc.com` still serves the old Joomla site on
Lightsail, so a push to `main` updates only the `workers.dev` URL, not the public site.

### Manual deploy

Only needed when bypassing Workers Builds (it is the normal path — prefer a push):

```sh
npm run build
npx wrangler deploy                # publish the existing build, live immediately
npx wrangler deploy --dry-run      # bundle only, publishes nothing
```

The adapter emits `dist/client` (static assets) and `dist/server` (the Worker entrypoint);
`wrangler.jsonc` wires both together, so `wrangler deploy` must run from the repo root
*after* a build — it does not build for you.

To stage a version **without** putting it live — useful for checking a build before it
serves traffic:

```sh
npx wrangler versions upload       # upload a version, receive no traffic
npx wrangler versions deploy       # promote a version to 100%
npx wrangler versions list         # version ids, timestamps, authors
npx wrangler deployments list      # what is actually serving
```

### Local development with bindings

`npm run dev` runs the site inside workerd via `@cloudflare/vite-plugin`, so D1 and vars are
available in dev — `import { env } from 'cloudflare:workers'` works there exactly as it does
in production. (`Astro.locals.runtime.env` was removed in Astro 6; the import replaces it.)

```sh
npm run dev         # workerd + local D1, http://localhost:4321
npm run build && npm run preview   # the built Worker, closest to production
```

Local vars live in `.dev.vars` (gitignored):

```
ACCESS_TEAM_DOMAIN=yellowfeather
ACCESS_AUD=<the Access application's AUD tag>
ADMIN_EMAILS=someone@example.com,another@example.com
```

On the Worker these are secrets, set with `npx wrangler secret put <NAME>`.
Secrets survive a deploy; dashboard-set plaintext variables can be wiped by one.

Because Access does not sit in front of a local dev server, `astro dev` fakes a sign-in.
Add `?as=` to any URL to become that person; the address is kept in a cookie from then on:

```
http://localhost:4321/schedule/book?as=mckeown.edward7@gmail.com   # a team manager
http://localhost:4321/schedule/book?as=chair@littletonjuniorfc.com # committee (admin)
http://localhost:4321/schedule/book?as=nobody@example.com          # not allowlisted
http://localhost:4321/schedule?as=                                 # sign out
```

An `x-dev-user:` header does the same for curl. Both paths live behind
`import.meta.env.DEV`, which is statically replaced at build time — neither string survives
into `dist/`, so they cannot be used against the deployed Worker.

### Bindings and secrets

D1 is declared in `wrangler.jsonc`, which Workers Builds reads from the repo — so a binding
added here reaches production on the next push, no dashboard step needed:

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "ljfc-bookings", "database_id": "38d3059f-…" }
]
```

After changing bindings, regenerate the types:

```sh
npm run generate-types      # wrangler types → worker-configuration.d.ts (gitignored)
```

Local-only secrets go in `.dev.vars` (gitignored); deployed secrets go in
`npx wrangler secret put <NAME>`. Never commit either.

### D1

```sh
npx wrangler d1 execute ljfc-bookings --local  --file=./path/to/schema.sql   # local dev DB
npx wrangler d1 execute ljfc-bookings --remote --file=./path/to/schema.sql   # production
npx wrangler d1 execute ljfc-bookings --remote --command="SELECT * FROM bookings LIMIT 5"
```

The schema lives in `migrations/0001_bookings.sql` and is applied to both the local and
remote databases — see the next section for the commands.

### Pitch bookings (D1)

`/schedule` is public and server-rendered from D1; `/schedule/book` and `/api/bookings` are
behind Cloudflare Access. Managers can create, edit and delete bookings for their own squads;
committee members for any. Delete is a soft cancel — the row stays with `cancelled_at` set,
so the slot frees up but the record of who booked what is kept. Schema lives in `migrations/`:

```sh
npx wrangler d1 execute ljfc-bookings --local  --file=./migrations/0001_bookings.sql
npx wrangler d1 execute ljfc-bookings --local  --file=./scripts/seed-bookings.sql   # dev rows
npx wrangler d1 execute ljfc-bookings --remote --file=./migrations/0001_bookings.sql
```

Importing the old Joomla bookings — reads the dump, writes SQL, touches no database:

```sh
node scripts/migrate-bookings.mjs                      # cutoff 2026-09-01, ../current/ljfc-db.sql
node scripts/migrate-bookings.mjs --dump ~/fresh-dump.sql
node scripts/migrate-bookings.mjs --cutoff 2026-10-01   # override if the cutover slips
npx wrangler d1 execute ljfc-bookings --local --file=./scripts/out/bookings-import.sql
```

It reports what it kept, what it rejected, what it imported with a caveat
(`scripts/out/bookings-unmapped.csv`), and every pair of bookings that overlap on the same
pitch (`scripts/out/bookings-conflicts.csv`). Club policy is one team per pitch at a time, but
the old system never enforced it and this import writes SQL directly — so read the conflicts
file and resolve those rows before applying to `--remote`.

Who may book is derived from content, not a separate list: managers come from the 45 squads
in `teams.json`, admins from three places, in order of privacy:

1. the committee group in `people.json` — already published on the club website
2. `adminEmails` in `settings/bookings.json` — addresses you don't mind committing
3. the `ADMIN_EMAILS` secret on the Worker — comma-separated, for addresses that must not
   appear in this **public** repo

`allowlist()` in `src/lib/squads.ts` returns every address the Access policy should admit,
including those from the secret. Note that being on the Access policy is not enough on its
own: Access proves who you are, and this list decides what you may do.

#### Where the Access allowlist actually lives

The addresses are **not** inline in the Access policy. They are held in a Cloudflare list
named **`LJFC Emails`**, in the dashboard under:

> **Zero Trust → Reusable components → Lists**

The Access application for `/schedule/book*` and `/api/bookings*` references that list, so
adding or removing someone is done there, in one place, rather than by editing the policy.

**These are two separate gates, and they drift.** The list decides who may *reach* the
Worker; `roleFor()` in `src/lib/squads.ts` decides what they may *do* once they arrive, and
it reads `teams.json`, `people.json`, `settings/bookings.json` and the `ADMIN_EMAILS` secret.
Adding someone to `LJFC Emails` alone gets them past Access and then straight into
*"<email> is not on the list of team managers."* Changing a manager in `teams.json` and
redeploying does not touch the list. Whenever you change one, check the other:

```sh
node scripts/print-allowlist.mjs        # 49 addresses, one per line
```

That reimplements `allowlist()` against the JSON directly — `squads.ts` itself imports
`cloudflare:workers` and cannot run outside a Worker. It therefore prints everything except
addresses held only in the `ADMIN_EMAILS` secret, which by design are not in this repo.

### Still open before cutover

Everything in this section used to list Access, redirects and the booking system as unbuilt.
All three are done — see `STATUS.md` for the detail. What actually remains:

- **10 review bookings** need a decision from the club (`scripts/out/bookings-review.txt`) —
  the only real cutover blocker
- **Keystatic** was never built and is deliberately deferred until after go-live; content is
  edited by changing files in this repo
- **Legacy Joomla URLs** (`index.php?option=com_*`, `/component/*`) are deliberately *not*
  redirected and will 404. The one exception is the PDFs, which moved from
  `/images/downloads/` to `/downloads/` and carry a 301 in `public/_redirects`

### Cutover (not done)

Full checklist in `migration-plan.md` §6. In short: lower the DNS TTL 24h ahead, cut over in
a low-traffic window, point DNS at Cloudflare, and leave the Lightsail server running for
~2 weeks as a rollback.
