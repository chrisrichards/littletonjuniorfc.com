/*
 * One-shot Joomla → D1 pitch-booking migration.
 *
 * Reads the SQL dump at ../current/ljfc-db.sql, takes every booking from
 * `josbg_jux_timetable_events` on or after CUTOFF, and writes:
 *   scripts/out/bookings-import.sql    — INSERTs to apply with `wrangler d1 execute`
 *   scripts/out/bookings-unmapped.csv  — rows needing a human decision
 *
 * Nothing is written to any database: apply the SQL yourself, local first.
 *
 * The old data has no usable per-manager identity — 2,153 of 2,161 bookings were
 * made by one shared `coach` login — so `manager_email` is recovered by matching
 * the free-text manager name in `description` against teams.json, and left NULL
 * when that fails. `team_label` always keeps the original title verbatim.
 *
 * Usage:
 *   node scripts/migrate-bookings.mjs [--cutoff 2026-09-01] [--dump path]
 *
 * Idempotent: re-running overwrites the output files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'scripts/out');

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

// Only current and future bookings are migrated: history has no functional
// value for a pitch booker, and the club asked for 1 September 2026 onwards.
const CUTOFF = argOf('cutoff', '2026-09-01');
const DUMP = path.resolve(ROOT, argOf('dump', '../current/ljfc-db.sql'));

/*
 * Anything outside this window is a data-entry error, not a booking. The dump
 * carries a 1937-02-09 row, and a 2028-09-09 "U11 Rangers" row that has been
 * sitting there since at least May — two years beyond the cutoff, for an age
 * group that will have moved on twice by then. Real bookings run about two
 * seasons ahead at most, so anything past the horizon is reported, not imported.
 */
const HORIZON_MONTHS = Number(argOf('horizon-months', '18'));
const SANE_FROM = '2019-01-01';
const SANE_TO = (() => {
  const [y, m, d] = CUTOFF.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + HORIZON_MONTHS, d, 12));
  return dt.toISOString().slice(0, 10);
})();

// josbg_jux_timetable_eventcategories -> our pitch ids
const PITCH_BY_CAT = { 52: 'nursery', 53: 'top', 54: 'middle', 55: 'bottom' };

// josbg_jux_timetable_events column positions
const COL = {
  id: 0,
  title: 1,
  cat_id: 3,
  published: 9,
  description: 11,
  created: 15,
  created_by: 16,
  startdate: 17,
  starttime: 18,
  enddate: 19,
  endtime: 20,
};

/** Split `INSERT INTO x VALUES (…),(…);` into rows, respecting quotes/escapes. */
function parseInsertRows(dump, table) {
  const re = new RegExp('INSERT INTO `' + table + '` VALUES (.+?);\\n', 'gs');
  const rows = [];
  for (const stmt of dump.matchAll(re)) {
    const s = stmt[1];
    let i = 0;
    let row = null;
    let cur = '';
    let quoted = false;
    while (i < s.length) {
      const c = s[i];
      if (quoted) {
        if (c === '\\') {
          cur += s[i + 1];
          i += 2;
          continue;
        }
        if (c === "'") {
          quoted = false;
          i++;
          continue;
        }
        cur += c;
        i++;
        continue;
      }
      if (c === "'") {
        quoted = true;
        i++;
        continue;
      }
      if (c === '(') {
        row = [];
        cur = '';
        i++;
        continue;
      }
      if (c === ',' && row) {
        row.push(cur.trim());
        cur = '';
        i++;
        continue;
      }
      if (c === ')' && row) {
        row.push(cur.trim());
        rows.push(row);
        row = null;
        cur = '';
        i++;
        continue;
      }
      if (row) cur += c;
      i++;
    }
  }
  return rows;
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
const sqlStr = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const teams = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/teams.json'), 'utf8'));
const squads = teams.flatMap((g) =>
  g.squads.map((s) => ({
    id: `${g.id}-${slug(s.name)}`,
    label: `${s.name} ${g.age}`,
    name: s.name,
    age: g.age,
    managerName: s.managerName,
    managerEmail: s.managerEmail.toLowerCase(),
  }))
);

/*
 * Old titles are free text: "Broncos U13", "u11 Rebels", "Hawks U14".
 * Match on normalised name + age together, then fall back to a unique name-only
 * hit. Anything ambiguous is reported rather than guessed.
 */
function matchSquad(title) {
  const t = norm(title);
  if (!t) return null;

  const exact = squads.filter((s) => norm(s.label) === t);
  if (exact.length === 1) return exact[0];

  const age = title.match(/\bu\s?(\d{1,2})\b/i)?.[1];
  const withAge = squads.filter(
    (s) => t.includes(norm(s.name)) && (age ? s.age.toLowerCase() === `u${age}` : true)
  );
  if (withAge.length === 1) return withAge[0];

  const byName = squads.filter((s) => t.includes(norm(s.name)));
  return byName.length === 1 ? byName[0] : null;
}

/*
 * Some bookings are titled with the manager's name rather than the team —
 * "Max Downey" instead of "Ospreys U15". Where the title is exactly a manager
 * who runs a single squad, that is unambiguous, so resolve it to the team.
 * Managers with more than one squad are skipped: guessing which is wrong.
 */
function matchSquadByManagerName(title) {
  const t = norm(title);
  if (!t) return null;
  const hits = squads.filter((s) => norm(s.managerName) === t);
  return hits.length === 1 ? hits[0] : null;
}

function matchManager(description) {
  const text = norm(stripTags(description));
  if (!text) return null;
  const hits = squads.filter((s) => text.includes(norm(s.managerName)));
  return hits.length >= 1 ? hits[0] : null;
}

/** '08:40' / '8:40' / '08:40:00' -> '08:40'; anything else -> null. */
function normTime(raw) {
  const m = String(raw).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------

if (!fs.existsSync(DUMP)) {
  console.error(`Dump not found: ${DUMP}`);
  process.exit(1);
}

const dump = fs.readFileSync(DUMP, 'utf8');
const events = parseInsertRows(dump, 'josbg_jux_timetable_events');
if (events.length === 0) {
  console.error('No rows parsed from josbg_jux_timetable_events — is this the right dump?');
  process.exit(1);
}

const kept = [];
const unmapped = [];
const notes = [];
const byMonth = {};

for (const r of events) {
  const id = r[COL.id];
  const title = r[COL.title] ?? '';
  const date = r[COL.startdate];
  const reject = (reason) => unmapped.push({ id, title, date, reason });

  if (!date || date < CUTOFF) continue;

  /*
   * Joomla's publish state: 1 published, 0 unpublished, -2 trashed. The live
   * site shows only published rows, so anything else is a booking that was
   * cancelled or deleted and must not be carried across — importing them
   * resurrects bookings the club has already dropped, and manufactures clashes
   * against slots nobody actually holds. Skipped silently: a deleted booking is
   * not a problem for anyone to review.
   */
  if (r[COL.published] !== '1') continue;
  if (date < SANE_FROM || date >= SANE_TO) {
    reject(`${date} is beyond the ${HORIZON_MONTHS}-month horizon (to ${SANE_TO})`);
    continue;
  }
  /*
   * `enddate` is frequently mistyped — 2025-12-01 ending 2025-01-12, day and
   * month transposed — and we never use it: a booking's duration comes from
   * starttime/endtime on startdate. An end BEFORE the start is therefore a
   * corrupt field, not a multi-day booking, and dropping the row would lose a
   * real booking over a typo. Note it and carry on. Only an end genuinely
   * after the start is ambiguous enough to reject.
   */
  if (r[COL.enddate] && r[COL.enddate] > date) {
    reject(`spans multiple days (ends ${r[COL.enddate]})`);
    continue;
  }
  if (r[COL.enddate] && r[COL.enddate] < date) {
    notes.push({ id, title, date, reason: `ignored corrupt enddate ${r[COL.enddate]}` });
  }

  const pitch = PITCH_BY_CAT[Number(r[COL.cat_id])];
  if (!pitch) {
    reject(`unknown pitch category ${r[COL.cat_id]}`);
    continue;
  }

  const start = normTime(r[COL.starttime]);
  const end = normTime(r[COL.endtime]);
  if (!start || !end) {
    reject(`unreadable time "${r[COL.starttime]}"-"${r[COL.endtime]}"`);
    continue;
  }
  if (end <= start) {
    reject(`end ${end} not after start ${start}`);
    continue;
  }

  let squad = matchSquad(title);
  let renamedFrom = null;
  if (!squad) {
    const byManager = matchSquadByManagerName(title);
    if (byManager) {
      squad = byManager;
      renamedFrom = title;
    }
  }
  const manager = squad ?? matchManager(r[COL.description] ?? '');
  if (!squad) reject(`no squad matched title "${title}" (imported with squad_id NULL)`);

  byMonth[date.slice(0, 7)] = (byMonth[date.slice(0, 7)] ?? 0) + 1;

  kept.push({
    pitch,
    date,
    start_time: start,
    end_time: end,
    squad_id: squad?.id ?? null,
    team_label: squad && renamedFrom ? squad.label : title.trim() || 'Booking',
    manager_email: manager?.managerEmail ?? null,
    manager_name: manager?.managerName ?? (stripTags(r[COL.description] ?? '').slice(0, 80) || null),
    joomla_id: id,
    renamedFrom,
  });
  if (renamedFrom) {
    notes.push({ id, title, date, reason: `title was a manager name — imported as "${squad.label}"` });
  }
}

/*
 * The same booking is sometimes saved two or three times — three identical
 * Ospreys U15 rows on bottom, 2026-11-01, 09:30-11:30. Identical pitch, date,
 * times AND team is one booking entered repeatedly, not a real clash, so keep
 * the first and report the rest. Anything that differs in any field is left
 * alone for a human to look at.
 */
const duplicates = [];
{
  const seen = new Map();
  for (let i = kept.length - 1; i >= 0; i--) {
    const b = kept[i];
    const k = [b.pitch, b.date, b.start_time, b.end_time, b.team_label].join('|');
    if (seen.has(k)) {
      duplicates.push({ ...b, keptId: seen.get(k) });
      kept.splice(i, 1);
    } else {
      seen.set(k, b.joomla_id);
    }
  }
  duplicates.reverse();
}

/*
 * Club policy is one team per pitch at a time (maxConcurrentPerPitch = 1), but
 * the old system never enforced it and this import writes SQL directly, so the
 * application-level check never sees these rows. Any overlap that lands in the
 * import is therefore a real conflict for someone to resolve by hand — list them
 * rather than let them appear silently on the schedule.
 */
const conflicts = [];
{
  const byPitchDay = new Map();
  for (const b of kept) {
    const k = `${b.pitch}|${b.date}`;
    byPitchDay.set(k, [...(byPitchDay.get(k) ?? []), b]);
  }
  for (const [, items] of byPitchDay) {
    items.sort((x, y) => x.start_time.localeCompare(y.start_time));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].end_time > items[j].start_time) {
          conflicts.push([items[i], items[j]]);
        }
      }
    }
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

fs.writeFileSync(
  path.join(OUT_DIR, 'bookings-conflicts.csv'),
  [
    'pitch,date,a_joomla_id,a_team,a_start,a_end,b_joomla_id,b_team,b_start,b_end',
    ...conflicts.map(
      ([a, b]) =>
        `${a.pitch},${a.date},${a.joomla_id},"${a.team_label}",${a.start_time},${a.end_time},` +
        `${b.joomla_id},"${b.team_label}",${b.start_time},${b.end_time}`
    ),
  ].join('\n')
);

const sql = [
  '-- Generated by scripts/migrate-bookings.mjs — do not edit by hand.',
  `-- Source: ${DUMP}`,
  `-- Bookings on or after ${CUTOFF}: ${kept.length}`,
  '',
  "DELETE FROM bookings WHERE source = 'joomla';",
  '',
  ...kept.map(
    (b) =>
      'INSERT INTO bookings (pitch, date, start_time, end_time, squad_id, team_label, ' +
      "manager_email, manager_name, booked_by, source) VALUES (" +
      [
        sqlStr(b.pitch),
        sqlStr(b.date),
        sqlStr(b.start_time),
        sqlStr(b.end_time),
        sqlStr(b.squad_id),
        sqlStr(b.team_label),
        sqlStr(b.manager_email),
        sqlStr(b.manager_name),
        'NULL',
        "'joomla'",
      ].join(', ') +
      `); -- joomla id ${b.joomla_id}`
  ),
  '',
].join('\n');

fs.writeFileSync(path.join(OUT_DIR, 'bookings-import.sql'), sql);

const csv = [
  'joomla_id,date,title,reason',
  ...[...unmapped, ...notes].map(
    (u) => `${u.id},${u.date},"${String(u.title).replace(/"/g, '""')}","${u.reason}"`
  ),
].join('\n');
fs.writeFileSync(path.join(OUT_DIR, 'bookings-unmapped.csv'), csv);

/*
 * A plain-text, date-ordered list of everything a human has to decide, meant to
 * be pasted into an email to the club. Three kinds of item: two teams booked
 * over each other, a booking whose team could not be identified, and a booking
 * that was not imported at all.
 */
const PITCH_LABEL = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/settings/bookings.json'), 'utf8'))
    .pitches.map((p) => [p.id, p.label])
);

const longDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day, 12));
  const wd = dt.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' });
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
  return `${wd} ${day} ${mon} ${y}`;
};

const items = [];

for (const [a, b] of conflicts) {
  items.push({
    date: a.date,
    sort: `${a.date} ${a.start_time}`,
    head: `${longDate(a.date).padEnd(16)} ${(PITCH_LABEL[a.pitch] ?? a.pitch).padEnd(14)} CLASH`,
    body: [
      `    ${a.start_time}-${a.end_time}  ${a.team_label}${a.manager_name ? ` — ${a.manager_name}` : ''}`,
      `    ${b.start_time}-${b.end_time}  ${b.team_label}${b.manager_name ? ` — ${b.manager_name}` : ''}`,
    ],
  });
}

for (const b of kept.filter((k) => !k.squad_id)) {
  items.push({
    date: b.date,
    sort: `${b.date} ${b.start_time}`,
    head: `${longDate(b.date).padEnd(16)} ${(PITCH_LABEL[b.pitch] ?? b.pitch).padEnd(14)} UNKNOWN TEAM`,
    body: [
      `    ${b.start_time}-${b.end_time}  ${b.team_label}${b.manager_name ? ` — ${b.manager_name}` : ' — no contact given'}`,
    ],
  });
}

// The CSV keeps the technical reason; the email needs plain English.
const plainReason = (r) => {
  if (/unknown pitch category/.test(r)) return 'no pitch was recorded against it';
  if (/end .* not after start/.test(r)) return 'the start and end times are the same';
  if (/beyond the .*horizon/.test(r)) return 'dated years ahead — it looks like a typing error';
  if (/spans multiple days/.test(r)) return 'it runs across more than one day';
  if (/unreadable time/.test(r)) return 'the times could not be read';
  return r;
};

for (const u of unmapped.filter((x) => !/imported with squad_id NULL/.test(x.reason))) {
  items.push({
    date: u.date,
    sort: `${u.date} 00:00`,
    head: `${longDate(u.date).padEnd(16)} ${''.padEnd(14)} NOT IMPORTED`,
    body: [`    ${u.title} — ${plainReason(u.reason)}`],
  });
}

items.sort((x, y) => x.sort.localeCompare(y.sort));

const rule = '-'.repeat(72);
const reviewText = [
  'Littleton Junior FC — pitch bookings needing a decision',
  '',
  `Taken from the Joomla booking system on ${new Date().toISOString().slice(0, 10)},`,
  `covering bookings from ${CUTOFF} onwards.`,
  '',
  `${kept.length} bookings transfer across with no problem. The ${items.length} below need a`,
  'decision before the new booking system goes live, in date order.',
  '',
  'CLASH         Two teams hold the same pitch at the same time. The new system',
  '              allows only one team per pitch, which the old one did not',
  '              enforce, so one of the two has to move.',
  '',
  'UNKNOWN TEAM  The team is not listed on the website, so the booking cannot be',
  '              tied to a manager who could later change or cancel it. It will',
  '              still show on the schedule.',
  '',
  'NOT IMPORTED  Could not be carried across at all — the reason is given.',
  '',
  rule,
  '',
  ...items.flatMap((it) => [it.head, ...it.body, '']),
  rule,
  '',
  duplicates.length
    ? `For information: ${duplicates.length} booking(s) had been saved more than once and were ` +
      'automatically reduced to a single booking. No action needed.'
    : '',
  '',
].join('\n');

fs.writeFileSync(path.join(OUT_DIR, 'bookings-review.txt'), reviewText);

const withSquad = kept.filter((b) => b.squad_id).length;
const withManager = kept.filter((b) => b.manager_email).length;

console.log(`Dump:            ${DUMP}`);
console.log(`Events in dump:  ${events.length}`);
console.log(`Cutoff:          ${CUTOFF}`);
console.log(`Kept:            ${kept.length}`);
console.log(`  duplicates dropped: ${duplicates.length} (identical pitch/date/time/team)`);
console.log(`  squad matched:   ${withSquad}/${kept.length}`);
console.log(`  manager matched: ${withManager}/${kept.length}`);
console.log(`Rejected:        ${unmapped.length}  (scripts/out/bookings-unmapped.csv)`);
console.log(`Pitch conflicts: ${conflicts.length}  (scripts/out/bookings-conflicts.csv)`);
console.log(`Imported w/ note: ${notes.length}  (same file — kept, but worth an eye)`);
if (Object.keys(byMonth).length) {
  console.log('By month:');
  for (const m of Object.keys(byMonth).sort()) console.log(`  ${m}  ${byMonth[m]}`);
}
console.log('');
console.log(`Wrote scripts/out/bookings-review.txt — ${items.length} item(s) for the club to decide.`);
console.log('');
console.log('Wrote scripts/out/bookings-import.sql — apply it with:');
console.log('  npx wrangler d1 execute ljfc-bookings --local  --file=./scripts/out/bookings-import.sql');
console.log('  npx wrangler d1 execute ljfc-bookings --remote --file=./scripts/out/bookings-import.sql');
