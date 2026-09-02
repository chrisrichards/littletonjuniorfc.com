import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { create, update, cancel, byId, pitches, type Booking } from '../../lib/bookings';
import { getUser } from '../../lib/access';
import { squadById, squadsForEmail } from '../../lib/squads';
import { isValidDate, isValidTime, addMinutes, today, addDays } from '../../lib/dates';
import settings from '../../content/settings/bookings.json';

export const prerender = false;

/*
 * Create, edit and delete bookings. Plain form POSTs, not JSON, so the booking form
 * works without client JS; the reply is a redirect back to the form carrying an
 * `ok` or `err` message.
 *
 * Cloudflare Access guards this route, but authorisation is still enforced here
 * — Access proves who you are, it does not decide which squads you may book for.
 */

/*
 * Forms post from both /schedule/book and a booking's own page, so they carry a
 * `return` path saying where to land afterwards. Only same-site /schedule paths
 * are accepted — a caller-supplied redirect target is an open redirect
 * otherwise, and "//evil.com" is a protocol-relative URL, not a local path.
 */
function safeReturn(value: FormDataEntryValue | null): string {
  const v = String(value ?? '');
  // Rejects, in order: anything not under /schedule, "//evil.com" (a
  // protocol-relative URL, not a local path), and "/schedule/../admin", which a
  // browser normalises to /admin and so escapes the prefix entirely.
  const shaped = /^\/schedule(\/[A-Za-z0-9._~\-/]*)?$/.test(v);
  return shaped && !v.includes('//') && !v.split('/').includes('..')
    ? v
    : '/schedule/book';
}

const back = (params: Record<string, string>, target = '/schedule/book') =>
  new Response(null, {
    status: 303,
    headers: { Location: `${target}?${new URLSearchParams(params)}` },
  });

/** Who may change a given booking: admins anything, managers their own. */
function canManage(user: { email: string; role: string }, b: Booking): boolean {
  return user.role === 'admin' || (b.manager_email !== null && b.manager_email === user.email);
}

/*
 * Shared by create and edit: read the form, check every rule, and return either
 * a message or the booking fields. Keeping it in one place means an edit cannot
 * quietly accept something a new booking would reject.
 */
function readBooking(
  form: FormData,
  user: { email: string; role: string }
): { err: string } | { fields: NonNullable<Parameters<typeof update>[2]> } {
  const pitch = String(form.get('pitch') ?? '');
  const date = String(form.get('date') ?? '');
  const start = String(form.get('start_time') ?? '');
  const duration = Number(form.get('duration'));
  const squadId = String(form.get('squad_id') ?? '');

  if (!pitches.some((p) => p.id === pitch)) return { err: 'Pick a pitch.' };
  if (!isValidDate(date)) return { err: 'Pick a valid date.' };
  if (!isValidTime(start)) return { err: 'Pick a valid start time.' };
  if (!settings.durations.includes(duration)) return { err: 'Pick a duration.' };

  const squad = squadById(squadId);
  if (!squad) return { err: 'Pick a team.' };

  // A manager books only for their own squads; an admin books for anyone.
  if (user.role !== 'admin' && !squadsForEmail(user.email).some((s) => s.id === squad.id)) {
    return { err: `You are not listed as the manager of ${squad.label}.` };
  }

  const end = addMinutes(start, duration);
  if (end === '24:00' || end <= start) return { err: 'That booking runs past midnight.' };
  if (start < settings.openingTime || end > settings.closingTime) {
    return {
      err: `Bookings must fall between ${settings.openingTime} and ${settings.closingTime}.`,
    };
  }

  const now = today();
  if (date < now) return { err: 'That date is in the past.' };
  if (date > addDays(now, settings.maxWeeksAhead * 7)) {
    return { err: `Bookings open ${settings.maxWeeksAhead} weeks ahead.` };
  }

  return {
    fields: {
      pitch,
      date,
      start_time: start,
      end_time: end,
      squad_id: squad.id,
      team_label: squad.label,
      manager_email: squad.managerEmail,
      manager_name: squad.managerName,
    },
  };
}

const clashMessage = (pitch: string, existing: Booking[]) =>
  `${pitches.find((p) => p.id === pitch)!.label} is already booked that day: ` +
  existing.map((c) => `${c.team_label} ${c.start_time}\u2013${c.end_time}`).join(', ') + '.';

export const POST: APIRoute = async ({ request }) => {
  const user = await getUser(request);
  if (!user) return back({ err: 'Not signed in. Please sign in and try again.' });
  if (user.role === 'none') {
    return back({ err: `${user.email} is not on the list of team managers.` });
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? 'create');
  const to = safeReturn(form.get('return'));

  /*
   * Delete is a soft cancel: the row stays with cancelled_at set, so the record
   * of who booked what survives, while the slot frees up immediately and the
   * booking leaves the schedule.
   */
  if (action === 'cancel' || action === 'delete') {
    const id = Number(form.get('id'));
    if (!Number.isInteger(id)) return back({ err: 'That booking could not be found.' }, to);

    const existing = await byId(env.DB, id);
    if (!existing || existing.cancelled_at) {
      return back({ err: 'That booking could not be found.' }, to);
    }
    if (!canManage(user, existing)) {
      return back({ err: 'That booking belongs to another manager.' }, to);
    }
    return (await cancel(env.DB, id))
      ? back({ ok: `Deleted ${existing.team_label} on ${existing.date}.` }, to)
      : back({ err: 'That booking was already deleted.' }, to);
  }

  if (action === 'update') {
    const id = Number(form.get('id'));
    if (!Number.isInteger(id)) return back({ err: 'That booking could not be found.' }, to);

    const existing = await byId(env.DB, id);
    if (!existing || existing.cancelled_at) {
      return back({ err: 'That booking could not be found.' }, to);
    }
    if (!canManage(user, existing)) {
      return back({ err: 'That booking belongs to another manager.' }, to);
    }

    const parsed = readBooking(form, user);
    if ('err' in parsed) return back({ err: parsed.err, edit: String(id) }, to);

    const result = await update(env.DB, id, parsed.fields);
    if (!result.ok) {
      if (result.reason === 'gone') return back({ err: 'That booking could not be found.' }, to);
      return back(
        { err: clashMessage(parsed.fields.pitch, result.existing), edit: String(id) },
        to
      );
    }
    const f = parsed.fields;
    return back(
      { ok: `Updated ${f.team_label} to ${f.date}, ${f.start_time}\u2013${f.end_time}.`, week: f.date },
      to
    );
  }

  const parsed = readBooking(form, user);
  if ('err' in parsed) return back({ err: parsed.err });

  const f = parsed.fields;
  const result = await create(env.DB, { ...f, booked_by: user.email });

  if (!result.ok) {
    if (result.reason === 'gone') return back({ err: 'That booking could not be saved.' });
    return back({ err: clashMessage(f.pitch, result.existing) });
  }

  return back({ ok: `Booked ${f.team_label} on ${f.date} at ${f.start_time}\u2013${f.end_time}.`, week: f.date });
};
