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

### Local preview against the real runtime

```sh
npm run build
npm run preview     # runs the built Worker under workerd, with bindings from wrangler.jsonc
```

`npm run dev` is faster for markup and styling work, but it does not run the Worker, so
anything touching D1 or Access headers needs `npm run preview`.

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

The bookings schema is not written yet — see `migration-plan.md` §4 for the proposed shape
and `STATUS.md` for what remains.

### Not yet wired up

These are prerequisites for pointing the public domain at this site, and none of them are
done — see `STATUS.md`:

- **Cloudflare Access** — no policy on `/schedule/book`, no manager email allowlist
- **Legacy redirects** — `public/_redirects` is still commented-out placeholders, so old
  Joomla URLs will 404
- **Booking system** — `/schedule` is a "coming soon" placeholder

### Cutover (not done)

Full checklist in `migration-plan.md` §6. In short: lower the DNS TTL 24h ahead, cut over in
a low-traffic window, point DNS at Cloudflare, and leave the Lightsail server running for
~2 weeks as a rollback.
