/*
 * Read and write a JSON file in this repo through the GitHub contents API.
 *
 * The admin pages save people.json / teams.json by committing them, exactly as
 * Pages CMS does: the push triggers Workers Builds, which rebuilds the static
 * pages. Nothing is written at runtime — the site stays static.
 *
 * Every write carries the blob `sha` the editor started from. If the file has
 * changed since (a Pages CMS save, another admin), GitHub refuses with 409/422
 * and we report a conflict instead of overwriting someone else's edit.
 *
 * Config is passed in rather than read from `env` so this can be exercised
 * outside a Worker.
 */

export type GitHubConfig = {
  token: string; // fine-grained PAT: this repo only, Contents read & write
  repo: string; // 'owner/name'
  branch: string; // 'main'
  api?: string; // defaults to https://api.github.com
};

export type ReadResult<T> = { data: T; sha: string };

export type WriteResult =
  | { ok: true; commitSha: string; commitUrl: string }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'error'; message: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// base64 <-> UTF-8: atob/btoa work on Latin-1, and names like "Togay Koç" don't.
function toBase64(text: string): string {
  let bin = '';
  for (const byte of encoder.encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  return decoder.decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
}

function request(cfg: GitHubConfig, path: string, init: RequestInit = {}) {
  const url = `${cfg.api ?? 'https://api.github.com'}/repos/${cfg.repo}/contents/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'littletonjuniorfc-admin', // GitHub rejects requests without one
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

/** The file as it is on the branch now — not the copy bundled at build time. */
export async function readJson<T>(cfg: GitHubConfig, path: string): Promise<ReadResult<T>> {
  const res = await request(cfg, `${path}?ref=${encodeURIComponent(cfg.branch)}`);
  if (!res.ok) throw new Error(`GitHub read of ${path} failed: ${res.status}`);
  const body = (await res.json()) as { content: string; sha: string };
  return { data: JSON.parse(fromBase64(body.content)) as T, sha: body.sha };
}

/** The same formatting as the files in the repo: 2-space indent, trailing newline. */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}

export async function writeJson(
  cfg: GitHubConfig,
  path: string,
  data: unknown,
  sha: string,
  message: string
): Promise<WriteResult> {
  const res = await request(cfg, path, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toBase64(formatJson(data)), sha, branch: cfg.branch }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // A stale `sha` comes back as 409, or as 422 naming the sha; either way the
    // file changed after the editor loaded it.
    if (res.status === 409 || (res.status === 422 && /sha/i.test(detail))) {
      return { ok: false, reason: 'conflict' };
    }
    return { ok: false, reason: 'error', message: `GitHub save failed: ${res.status} ${detail.slice(0, 200)}` };
  }
  const body = (await res.json()) as { commit: { sha: string; html_url: string } };
  return { ok: true, commitSha: body.commit.sha, commitUrl: body.commit.html_url };
}
