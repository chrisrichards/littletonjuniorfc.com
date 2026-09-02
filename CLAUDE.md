# Project: Littleton Junior FC website migration

Migrating https://littletonjuniorfc.com from Joomla (Bitnami on AWS Lightsail) to:
- Astro static site
- Cloudflare Workers hosting (static assets, built by Workers Builds — not Pages)
- Cloudflare D1 for pitch bookings
- Cloudflare Access for booking auth (email allowlist)
- Pages CMS (pagescms.org — a hosted Git-based CMS, unrelated to Cloudflare Pages)
  for editing content JSON; config in `.pages.yml`, content stays in this repo

Hard constraint: new site must match current styling exactly.

See migration-plan.md for the detailed plan.
