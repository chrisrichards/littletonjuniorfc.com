/// <reference types="astro/client" />

/*
 * Bindings (DB, ASSETS) are generated into worker-configuration.d.ts by
 * `npm run generate-types` from wrangler.jsonc. That file is gitignored and
 * regenerated, so anything not expressible as a binding is merged in here.
 *
 * `import { env } from 'cloudflare:workers'` is typed as Cloudflare.Env, which
 * is what these vars must land on. (Astro.locals.runtime.env was removed in
 * Astro 6 — the cloudflare:workers import replaces it.)
 *
 * All three are set with `wrangler secret put` on the Worker, and in `.dev.vars`
 * locally. ACCESS_* are not really sensitive — the team domain and AUD tag are
 * both visible in the Access login redirect — but secrets survive a deploy,
 * whereas dashboard-set plaintext vars can be wiped by one. ADMIN_EMAILS is a
 * secret for a stronger reason: this repo is public.
 */
declare namespace Cloudflare {
  interface Env {
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    /** Comma-separated extra admin addresses, kept out of this public repo. */
    ADMIN_EMAILS?: string;
  }
}

interface Env {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ADMIN_EMAILS?: string;
}
