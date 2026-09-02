import { env } from 'cloudflare:workers';
import teams from '../content/teams.json';
import people from '../content/people.json';
import bookings from '../content/settings/bookings.json';

/*
 * teams.json is grouped by age (u6, u13, …) with squads nested inside, but a
 * booking references a single squad. Flatten to a lookup keyed by a derived id
 * — teams.json has no squad ids of its own — so `u13` + "Broncos" -> u13-broncos.
 */

export type Squad = {
  id: string; // 'u13-broncos'
  name: string; // 'Broncos'
  age: string; // 'U13'
  label: string; // 'Broncos U13' — matches the old Joomla booking titles
  groupId: string; // 'u13' — anchor on /teams
  managerName: string;
  managerEmail: string;
};

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const squads: Squad[] = teams.flatMap((group) =>
  group.squads.map((s) => ({
    id: `${group.id}-${slug(s.name)}`,
    name: s.name,
    age: group.age,
    label: `${s.name} ${group.age}`,
    groupId: group.id,
    managerName: s.managerName,
    managerEmail: s.managerEmail.toLowerCase(),
  }))
);

const byId = new Map(squads.map((s) => [s.id, s]));

export function squadById(id: string | null | undefined): Squad | undefined {
  return id ? byId.get(id) : undefined;
}

/** Squads this email manages. Empty for anyone who isn't a listed manager. */
export function squadsForEmail(email: string): Squad[] {
  const e = email.toLowerCase();
  return squads.filter((s) => s.managerEmail === e);
}

export type Role = 'admin' | 'manager' | 'none';

/*
 * Admins can book and cancel for any squad; managers only for their own.
 *
 * Three sources, in order of privacy:
 *   1. the committee group in people.json — already published on the website
 *   2. adminEmails in settings/bookings.json — for addresses you don't mind
 *      committing (this repo is public)
 *   3. the ADMIN_EMAILS secret on the Worker — comma-separated, for anyone whose
 *      address should NOT appear in a public repo
 *
 * Resolved lazily and cached: `env` is not reliably readable at module scope,
 * and every route that imports this file is server-rendered, so the first call
 * happens inside a request.
 */
let adminCache: Set<string> | null = null;

function adminEmailSet(): Set<string> {
  if (adminCache) return adminCache;
  const fromSecret = String(env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  adminCache = new Set<string>([
    ...people
      .filter((p) => bookings.adminGroupsFromPeople.includes(p.group))
      .map((p) => p.email.toLowerCase()),
    ...bookings.adminEmails.map((e: string) => e.toLowerCase()),
    ...fromSecret,
  ]);
  return adminCache;
}

export function roleFor(email: string | null | undefined): Role {
  if (!email) return 'none';
  const e = email.toLowerCase();
  if (adminEmailSet().has(e)) return 'admin';
  if (squads.some((s) => s.managerEmail === e)) return 'manager';
  return 'none';
}

/** An example admin address, for the local sign-in panel. */
export function adminExample(): string {
  return [...adminEmailSet()][0] ?? 'chair@littletonjuniorfc.com';
}

/** Every address Cloudflare Access should admit — paste into the Access policy. */
export function allowlist(): string[] {
  return [...new Set([...squads.map((s) => s.managerEmail), ...adminEmailSet()])].sort();
}
