import { z } from 'astro/zod';
import {
  personSchema,
  teamSchema,
  officialInfoPeople,
  type Person,
  type Team,
} from './content-schemas';
import { slug, squadId } from './slug';

/*
 * Form handling for the admin People and Teams pages (src/pages/admin/).
 *
 * Rows post as parallel arrays — every row carries every field, in DOM order —
 * so FormData.getAll('p_name')[i] belongs with getAll('p_email')[i]. That keeps
 * add / remove / reorder a matter of moving DOM rows, with no index renumbering.
 *
 * Kept free of `cloudflare:workers` so it can be tested outside a Worker.
 */

export type RowError = string;

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/*
 * Several of these fields are rendered with set:html (so a role can carry a
 * <br>), which makes them HTML. Allow line breaks and entities, nothing else.
 */
function htmlProblem(value: string): boolean {
  return /[<>]/.test(value.replace(/<br\s*\/?>/gi, ''));
}

const all = (form: FormData, name: string) => form.getAll(name).map((v) => String(v).trim());

/* ── People ─────────────────────────────────────────────────────────── */

export function parsePeople(form: FormData): { people: Person[]; errors: RowError[] } {
  const ids = all(form, 'p_id');
  const roles = all(form, 'p_role');
  const names = all(form, 'p_name');
  const emails = all(form, 'p_email');
  const phones = all(form, 'p_phone');
  const groups = all(form, 'p_group');
  const ageGroups = all(form, 'p_ageGroup');
  const yearLabels = all(form, 'p_yearLabel');
  const notes = all(form, 'p_note');

  const errors: RowError[] = [];
  const people: Person[] = [];
  const taken = new Set(ids.filter(Boolean));

  groups.forEach((group, i) => {
    // Coordinators' role is always "<age group> Coordinator", so it isn't asked for.
    const role = group === 'coordinator' ? `${ageGroups[i]} Coordinator` : roles[i];
    const label = group === 'coordinator' ? ageGroups[i] : role.replace(/<br\s*\/?>/gi, ' ');
    const n = groups.slice(0, i + 1).filter((g) => g === group).length; // row number within its list
    const at = `${group === 'coordinator' ? 'Coordinator' : 'Committee'} row ${n}${label ? ` (${label})` : ''}`;
    if (group !== 'committee' && group !== 'coordinator') errors.push(`${at}: pick committee or coordinator.`);

    // Existing rows keep their id — Official Info and the CMS key on it. New
    // rows get one from the role, made unique.
    let id = ids[i];
    if (!id) {
      const base = slug(role) || 'person';
      id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      taken.add(id);
    }

    if (group === 'committee' && !role) errors.push(`${at}: role is required.`);
    if (!names[i]) errors.push(`${at}: name is required.`);
    if (!EMAIL.test(emails[i])) errors.push(`${at}: "${emails[i]}" is not a valid email address.`);
    if (group === 'coordinator' && (!ageGroups[i] || !yearLabels[i])) {
      errors.push(`${at}: coordinators need an age group and a year label.`);
    }
    for (const [field, value] of [
      ['role', role], ['name', names[i]], ['age group', ageGroups[i]],
      ['year label', yearLabels[i]], ['note', notes[i]], ['phone', phones[i]],
    ] as const) {
      if (value && htmlProblem(value)) errors.push(`${at}: ${field} may only contain text and <br>.`);
    }

    // Same key order as the file, and optional fields only when set.
    const person: Person = { id, role, name: names[i], email: emails[i] } as Person;
    if (phones[i]) person.phone = phones[i];
    person.group = group as Person['group'];
    if (group === 'coordinator') {
      person.ageGroup = ageGroups[i];
      person.yearLabel = yearLabels[i];
    }
    if (notes[i]) person.note = notes[i];
    people.push(person);
  });

  const seen = new Set<string>();
  for (const p of people) {
    if (seen.has(p.id)) errors.push(`Two people share the id "${p.id}".`);
    seen.add(p.id);
  }
  for (const [label, id] of Object.entries(officialInfoPeople)) {
    if (!people.some((p) => p.id === id && p.group === 'committee')) {
      errors.push(`The ${label} ("${id}") is shown on Official Info and can't be removed — edit it instead.`);
    }
  }

  if (!errors.length) z.array(personSchema).parse(people); // belt and braces: the build's own schema
  return { people, errors };
}

/* ── Teams ──────────────────────────────────────────────────────────── */

/*
 * Age groups themselves (U6–U18) are fixed: their ids anchor the Teams page
 * and prefix every squad id. The form edits each group's year label and its
 * squads.
 */
export function parseTeams(form: FormData, current: Team[]): { teams: Team[]; errors: RowError[] } {
  const groupIds = all(form, 'g_id');
  const groupLabels = all(form, 'g_yearLabel');
  const sGroup = all(form, 's_group');
  const sName = all(form, 's_name');
  const sManager = all(form, 's_managerName');
  const sEmail = all(form, 's_managerEmail');

  const errors: RowError[] = [];
  const teams: Team[] = current.map((g) => {
    const i = groupIds.indexOf(g.id);
    const yearLabel = i >= 0 ? groupLabels[i] : g.yearLabel;
    if (!yearLabel) errors.push(`${g.age}: year label is required.`);
    else if (htmlProblem(yearLabel)) errors.push(`${g.age}: year label may only contain text.`);

    const squads = sGroup
      .map((gid, j) => ({ gid, name: sName[j], managerName: sManager[j], managerEmail: sEmail[j] }))
      .filter((s) => s.gid === g.id)
      .map(({ name, managerName, managerEmail }) => ({ name, managerName, managerEmail }));

    const ids = new Set<string>();
    squads.forEach((s, j) => {
      const at = `${g.age} squad ${j + 1}${s.name ? ` (${s.name})` : ''}`;
      if (!s.name || !slug(s.name)) errors.push(`${at}: squad name is required.`);
      else if (ids.has(squadId(g.id, s.name))) errors.push(`${at}: ${g.age} already has a squad called ${s.name}.`);
      ids.add(squadId(g.id, s.name));
      if (!s.managerName) errors.push(`${at}: manager name is required.`);
      if (!EMAIL.test(s.managerEmail)) errors.push(`${at}: "${s.managerEmail}" is not a valid email address.`);
      for (const v of [s.name, s.managerName]) if (htmlProblem(v)) errors.push(`${at}: names may only contain text.`);
    });
    return { id: g.id, age: g.age, yearLabel, squads };
  });

  if (!errors.length) z.array(teamSchema).parse(teams);
  return { teams, errors };
}

/** Squad ids that exist before but not after — bookings on these would be orphaned. */
export function removedSquadIds(before: Team[], after: Team[]): string[] {
  const kept = new Set(after.flatMap((g) => g.squads.map((s) => squadId(g.id, s.name))));
  return before.flatMap((g) => g.squads.map((s) => squadId(g.id, s.name))).filter((id) => !kept.has(id));
}

/* ── Booking allowlist ──────────────────────────────────────────────── */

type BookingSettings = { adminEmails: string[]; adminGroupsFromPeople: string[] };

/*
 * Who the "LJFC Emails" Cloudflare list should admit, from the JSON alone —
 * the same rule as allowlist() in squads.ts and scripts/print-allowlist.mjs.
 */
export function allowlistFrom(teams: Team[], people: Person[], cfg: BookingSettings): string[] {
  return [
    ...new Set(
      [
        ...teams.flatMap((g) => g.squads.map((s) => s.managerEmail)),
        ...people.filter((p) => cfg.adminGroupsFromPeople.includes(p.group)).map((p) => p.email),
        ...cfg.adminEmails,
      ]
        .filter(Boolean)
        .map((e) => e.toLowerCase())
    ),
  ].sort();
}

/**
 * What a save means for the Cloudflare list. Addresses in the ADMIN_EMAILS
 * secret are left out of both sides: they belong on the list regardless.
 */
export function allowlistChange(before: string[], after: string[], secret: Set<string>) {
  const b = new Set(before);
  const a = new Set(after);
  return {
    add: after.filter((e) => !b.has(e) && !secret.has(e)),
    remove: before.filter((e) => !a.has(e) && !secret.has(e)),
  };
}

/* ── Commit message ─────────────────────────────────────────────────── */

/*
 * The repo is public, and admins listed only in the ADMIN_EMAILS secret are
 * there precisely to keep their address out of it — so the editor is named
 * only when their address is already published on the site.
 */
export function commitMessage(path: string, editor: string, published: Iterable<string>): string {
  const isPublic = new Set([...published].map((e) => e.toLowerCase())).has(editor.toLowerCase());
  return `Update ${path} (via admin pages)\n\nEdited by ${isPublic ? editor : 'a site admin'}.`;
}

export function publishedEmails(teams: Team[], people: Person[]): string[] {
  return [...people.map((p) => p.email), ...teams.flatMap((g) => g.squads.map((s) => s.managerEmail))];
}
