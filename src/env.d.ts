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
 * ACCESS_* are plain vars, not secrets: a team domain and an Access
 * application's AUD tag are both non-sensitive. Set them in `.dev.vars`
 * locally, and on the Worker in the dashboard for production.
 */
declare namespace Cloudflare {
  interface Env {
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
  }
}

interface Env {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}
