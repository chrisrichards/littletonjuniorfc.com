import { env } from 'cloudflare:workers';
import { roleFor, type Role } from './squads';

/*
 * Cloudflare Access identity.
 *
 * Access puts the caller's email in `Cf-Access-Authenticated-User-Email`, but
 * that header is NOT evidence on its own: it is only trustworthy if the request
 * actually passed through Access, and a request that reaches the Worker by some
 * other path can set any header it likes. So we verify the signed
 * `CF_Authorization` JWT instead and read the email from the verified claims.
 *
 * Config comes from the environment (see README):
 *   ACCESS_TEAM_DOMAIN  e.g. 'yellowfeather'  -> yellowfeather.cloudflareaccess.com
 *   ACCESS_AUD          the Access application's AUD tag
 */

export type AccessUser = { email: string; role: Role };

type Jwk = JsonWebKey & { kid: string };

let cache: { domain: string; keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;
const KEY_TTL_MS = 60 * 60 * 1000; // Access rotates signing keys ~every 6 weeks

async function signingKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const fresh = cache && cache.domain === teamDomain && Date.now() - cache.fetchedAt < KEY_TTL_MS;
  if (fresh) return cache!.keys;

  const res = await fetch(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };

  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    map.set(
      jwk.kid,
      await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )
    );
  }
  cache = { domain: teamDomain, keys: map, fetchedAt: Date.now() };
  return map;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJson(part: string): any {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

function tokenFrom(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  return cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] ?? null;
}

/**
 * Verified email of the caller, or null if unauthenticated.
 * Throws only on misconfiguration, never on a bad token.
 */
export async function verifiedEmail(request: Request): Promise<string | null> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud) throw new Error('ACCESS_TEAM_DOMAIN / ACCESS_AUD are not configured');

  const token = tokenFrom(request);
  if (!token) return null;

  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;

  try {
    const header = decodeJson(h);
    if (header.alg !== 'RS256') return null;

    const key = (await signingKeys(teamDomain)).get(header.kid);
    if (!key) return null;

    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`)
    );
    if (!ok) return null;

    const claims = decodeJson(p);
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp < now) return null;
    if (typeof claims.nbf === 'number' && claims.nbf > now) return null;
    if (claims.iss !== `https://${teamDomain}.cloudflareaccess.com`) return null;

    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(aud)) return null;

    return typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  } catch {
    return null; // malformed token — treat as unauthenticated, never as an error
  }
}

/**
 * The caller, with their booking role resolved.
 *
 * In `astro dev` there is no Access in front of us, so a stand-in identity is
 * taken from an `x-dev-user` header (handy for curl) or the `dev_user` cookie
 * that src/middleware.ts sets from `?as=email` (handy in a browser).
 * `import.meta.env.DEV` is statically replaced at build time, so this branch is
 * removed entirely from a production bundle — it cannot be reached on the
 * deployed Worker.
 */
export async function getUser(request: Request): Promise<AccessUser | null> {
  if (import.meta.env.DEV) {
    const dev =
      request.headers.get('x-dev-user') ??
      decodeURIComponent(
        request.headers.get('Cookie')?.match(/(?:^|;\s*)dev_user=([^;]*)/)?.[1] ?? ''
      );
    if (dev) return { email: dev.toLowerCase(), role: roleFor(dev) };
  }
  const email = await verifiedEmail(request);
  return email ? { email, role: roleFor(email) } : null;
}
