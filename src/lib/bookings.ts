import settings from '../content/settings/bookings.json';

/*
 * D1 access for pitch bookings.
 *
 * Dates and times are LOCAL wall-clock strings (YYYY-MM-DD, HH:MM) — see the
 * note in migrations/0001_bookings.sql. Because both are zero-padded, string
 * comparison is chronological, so overlap detection needs no date maths.
 */

export type Booking = {
  id: number;
  pitch: string;
  date: string;
  start_time: string;
  end_time: string;
  squad_id: string | null;
  team_label: string;
  manager_email: string | null;
  manager_name: string | null;
  booked_by: string | null;
  source: string;
  created_at: string;
  cancelled_at: string | null;
};

export type NewBooking = {
  pitch: string;
  date: string;
  start_time: string;
  end_time: string;
  squad_id: string | null;
  team_label: string;
  manager_email: string | null;
  manager_name: string | null;
  booked_by: string;
};

export const pitches = settings.pitches;
export const pitchLabel = (id: string) =>
  settings.pitches.find((p) => p.id === id)?.label ?? id;

/** Live bookings between two dates inclusive, in display order. */
export async function listRange(db: D1Database, from: string, to: string): Promise<Booking[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM bookings
        WHERE cancelled_at IS NULL AND date >= ? AND date <= ?
        ORDER BY date, start_time, pitch`
    )
    .bind(from, to)
    .all<Booking>();
  return results ?? [];
}

export async function byId(db: D1Database, id: number): Promise<Booking | null> {
  return await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first<Booking>();
}

/**
 * Live bookings on the same pitch and date whose interval overlaps [start, end).
 * Touching bookings do not overlap: 09:30-11:30 and 11:30-13:30 both stand.
 */
export async function overlapping(
  db: D1Database,
  pitch: string,
  date: string,
  start: string,
  end: string,
  excludeId?: number
): Promise<Booking[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM bookings
        WHERE cancelled_at IS NULL AND pitch = ? AND date = ?
          AND start_time < ? AND end_time > ?
          AND (? IS NULL OR id != ?)
        ORDER BY start_time`
    )
    .bind(pitch, date, end, start, excludeId ?? null, excludeId ?? -1)
    .all<Booking>();
  return results ?? [];
}

export type WriteResult =
  | { ok: true; id: number }
  | { ok: false; reason: 'overlap'; existing: Booking[] }
  | { ok: false; reason: 'gone' };

/*
 * Club policy (decided 2026-09-02): one team per pitch at a time — no sharing.
 * That is `maxConcurrentPerPitch: 1` in settings/bookings.json, enforced here
 * rather than in the schema, because SQLite cannot express interval exclusion
 * as a constraint and the migrated Joomla data predates the rule.
 */
export async function create(db: D1Database, b: NewBooking): Promise<WriteResult> {
  const clashes = await overlapping(db, b.pitch, b.date, b.start_time, b.end_time);
  if (clashes.length >= settings.maxConcurrentPerPitch) {
    return { ok: false, reason: 'overlap', existing: clashes };
  }

  const row = await db
    .prepare(
      `INSERT INTO bookings
         (pitch, date, start_time, end_time, squad_id, team_label,
          manager_email, manager_name, booked_by, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'web')
       RETURNING id`
    )
    .bind(
      b.pitch,
      b.date,
      b.start_time,
      b.end_time,
      b.squad_id,
      b.team_label,
      b.manager_email,
      b.manager_name,
      b.booked_by
    )
    .first<{ id: number }>();
  return { ok: true, id: row!.id };
}

export type UpdateFields = {
  pitch: string;
  date: string;
  start_time: string;
  end_time: string;
  squad_id: string | null;
  team_label: string;
  manager_email: string | null;
  manager_name: string | null;
};

/**
 * Change an existing booking. The overlap check excludes the booking itself,
 * so moving one 15 minutes later does not collide with where it already is.
 */
export async function update(
  db: D1Database,
  id: number,
  f: UpdateFields
): Promise<WriteResult> {
  const clashes = await overlapping(db, f.pitch, f.date, f.start_time, f.end_time, id);
  if (clashes.length >= settings.maxConcurrentPerPitch) {
    return { ok: false, reason: 'overlap', existing: clashes };
  }

  const res = await db
    .prepare(
      `UPDATE bookings
          SET pitch = ?, date = ?, start_time = ?, end_time = ?,
              squad_id = ?, team_label = ?, manager_email = ?, manager_name = ?
        WHERE id = ? AND cancelled_at IS NULL`
    )
    .bind(
      f.pitch,
      f.date,
      f.start_time,
      f.end_time,
      f.squad_id,
      f.team_label,
      f.manager_email,
      f.manager_name,
      id
    )
    .run();

  // No row changed means it was cancelled or removed between load and save.
  return (res.meta?.changes ?? 0) > 0 ? { ok: true, id } : { ok: false, reason: 'gone' };
}

/** Soft-cancel, so the record of who booked what survives. */
export async function cancel(db: D1Database, id: number): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE bookings SET cancelled_at = datetime('now') WHERE id = ? AND cancelled_at IS NULL`)
    .bind(id)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}
