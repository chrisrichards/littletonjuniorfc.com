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
 * Admins are the committee (from people.json, the single source of truth for
 * club roles) plus any explicit extras in settings/bookings.json. They can book
 * and cancel for any squad; managers only for their own.
 */
const adminEmails = new Set<string>([
  ...people
    .filter((p) => bookings.adminGroupsFromPeople.includes(p.group))
    .map((p) => p.email.toLowerCase()),
  ...bookings.adminEmails.map((e: string) => e.toLowerCase()),
]);

export function roleFor(email: string | null | undefined): Role {
  if (!email) return 'none';
  const e = email.toLowerCase();
  if (adminEmails.has(e)) return 'admin';
  if (squads.some((s) => s.managerEmail === e)) return 'manager';
  return 'none';
}

/** Every address Cloudflare Access should admit — paste into the Access policy. */
export function allowlist(): string[] {
  return [...new Set([...squads.map((s) => s.managerEmail), ...adminEmails])].sort();
}
