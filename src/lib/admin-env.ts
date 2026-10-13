import { env } from 'cloudflare:workers';
import type { GitHubConfig } from './github';

/*
 * Worker config for the admin pages (see README → Admin pages):
 *   GITHUB_TOKEN   secret — fine-grained token, this repo only, Contents read & write
 *   GITHUB_REPO    var in wrangler.jsonc — 'owner/name'
 *   GITHUB_BRANCH  var in wrangler.jsonc — the branch Workers Builds deploys ('main')
 */
export function githubConfig(): GitHubConfig | null {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return null;
  return { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main' };
}

/** Admin addresses held only in the ADMIN_EMAILS secret (kept out of the public repo). */
export function secretAdminEmails(): Set<string> {
  return new Set(
    String(env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}
