# Littleton Junior FC website

Migration of [littletonjuniorfc.com](https://littletonjuniorfc.com) from Joomla on AWS Lightsail to Astro on Cloudflare Pages. See [`migration-plan.md`](./migration-plan.md) for the full plan.

## Stack

- **Astro** (static + server endpoints via the Cloudflare adapter)
- **Cloudflare Pages** — hosting
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
wrangler.jsonc       # Cloudflare config (Pages + D1 bindings)
astro.config.mjs     # Astro config
```

## Cloudflare bindings

Once you've created the D1 database, uncomment the `d1_databases` block in `wrangler.jsonc` and paste in the `database_id` from `npx wrangler d1 create ljfc-bookings`.
