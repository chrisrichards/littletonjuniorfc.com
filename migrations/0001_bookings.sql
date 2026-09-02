-- Phase 4: pitch bookings.
--
-- Times are stored as LOCAL wall-clock (Europe/London), split into date +
-- HH:MM, deliberately not UTC instants. The club states bookings in local time,
-- the Joomla source stored them this way, and it makes overlap detection a
-- plain string comparison with no DST conversion to get wrong.

CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pitch         TEXT NOT NULL,                        -- nursery | top | middle | bottom
  date          TEXT NOT NULL,                        -- YYYY-MM-DD
  start_time    TEXT NOT NULL,                        -- HH:MM
  end_time      TEXT NOT NULL,                        -- HH:MM
  squad_id      TEXT,                                 -- u13-broncos; NULL if unmapped legacy
  team_label    TEXT NOT NULL,                        -- display text, always populated
  manager_email TEXT,                                 -- who the booking is FOR
  manager_name  TEXT,
  booked_by     TEXT,                                 -- who created it (differs on admin override)
  source        TEXT NOT NULL DEFAULT 'web',          -- web | joomla
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at  TEXT,
  CHECK (end_time > start_time),
  CHECK (pitch IN ('nursery', 'top', 'middle', 'bottom'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_pitch_date ON bookings(pitch, date);
CREATE INDEX IF NOT EXISTS idx_bookings_date       ON bookings(date);

-- Deliberately NO unique index on (pitch, date, start_time): the historic data
-- has 35 slots where two or three teams share a pitch at the same time, which
-- appears to be normal practice for small-sided games rather than corruption.
-- How many teams may share a pitch is a policy question, so it lives in
-- settings/bookings.json (maxConcurrentPerPitch) and is enforced in
-- src/lib/bookings.ts, not baked into the schema.
