/*
 * Plain YYYY-MM-DD helpers.
 *
 * Bookings are stored as local wall-clock dates, and the Worker runs in UTC, so
 * "today" must be asked for in the club's timezone rather than taken from the
 * server clock. Arithmetic goes through UTC noon, which keeps a +/-1 day DST
 * shift from ever changing the calendar date.
 */

export const TZ = 'Europe/London';

const iso = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today in Europe/London as YYYY-MM-DD. */
export function today(): string {
  return iso.format(new Date());
}

function toUtcNoon(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function addDays(date: string, days: number): string {
  const dt = toUtcNoon(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const dow = toUtcNoon(date).getUTCDay(); // 0 Sun … 6 Sat
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date;
}

export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return '24:00'; // caller rejects; never wraps to next day
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** 'Sat 6 Sep' */
export function formatDay(date: string): string {
  return dayFmt.format(toUtcNoon(date));
}

const longFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** 'Saturday 6 September 2026' */
export function formatLong(date: string): string {
  return longFmt.format(toUtcNoon(date));
}
