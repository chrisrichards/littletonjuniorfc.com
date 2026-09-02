import { readFileSync as r } from 'node:fs';
const j = (f) => JSON.parse(r(f, 'utf8'));
const teams = j('src/content/teams.json'), people = j('src/content/people.json'), cfg = j('src/content/settings/bookings.json');
const list = [...new Set([
  ...teams.flatMap((g) => g.squads.map((s) => s.managerEmail)),
  ...people.filter((p) => cfg.adminGroupsFromPeople.includes(p.group)).map((p) => p.email),
  ...cfg.adminEmails,
].filter(Boolean).map((e) => e.toLowerCase()))].sort();
console.log(list.join('\n'));
console.error(`${list.length} addresses (excludes anything only in the ADMIN_EMAILS secret)`);
