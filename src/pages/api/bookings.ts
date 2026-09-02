import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { create, cancel, byId, pitches } from '../../lib/bookings';
import { getUser } from '../../lib/access';
import { squadById, squadsForEmail } from '../../lib/squads';
import { isValidDate, isValidTime, addMinutes, today, addDays } from '../../lib/dates';
import settings from '../../content/settings/bookings.json';

export const prerender = false;

/*
 * Create and cancel bookings. Plain form POSTs, not JSON, so the booking form
 * works without client JS; the reply is a redirect back to the form carrying an
 * `ok` or `err` message.
 *
 * Cloudflare Access guards this route, but authorisation is still enforced here
 * — Access proves who you are, it does not decide which squads you may book for.
 */

const back = (params: Record<string, string>) =>
  new Response(null, {
    status: 303,
    headers: { Location: `/schedule/book?${new URLSearchParams(params)}` },
  });

export const POST: APIRoute = async ({ request }) => {
  const user = await getUser(request);
  if (!user) return back({ err: 'Not signed in. Please sign in and try again.' });
  if (user.role === 'none') {
    return back({ err: `${user.email} is not on the list of team managers.` });
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? 'create');

  if (action === 'cancel') {
    const id = Number(form.get('id'));
    if (!Number.isInteger(id)) return back({ err: 'That booking could not be found.' });

    const existing = await byId(env.DB, id);
    if (!existing || existing.cancelled_at) {
      return back({ err: 'That booking could not be found.' });
    }
    // Managers may only cancel their own; admins may cancel anything.
    if (user.role !== 'admin' && existing.manager_email !== user.email) {
      return back({ err: 'That booking belongs to another manager.' });
    }
    return (await cancel(env.DB, id))
      ? back({ ok: 'Booking cancelled.' })
      : back({ err: 'That booking was already cancelled.' });
  }

  const pitch = String(form.get('pitch') ?? '');
  const date = String(form.get('date') ?? '');
  const start = String(form.get('start_time') ?? '');
  const duration = Number(form.get('duration'));
  const squadId = String(form.get('squad_id') ?? '');

  if (!pitches.some((p) => p.id === pitch)) return back({ err: 'Pick a pitch.' });
  if (!isValidDate(date)) return back({ err: 'Pick a valid date.' });
  if (!isValidTime(start)) return back({ err: 'Pick a valid start time.' });
  if (!settings.durations.includes(duration)) return back({ err: 'Pick a duration.' });

  const squad = squadById(squadId);
  if (!squad) return back({ err: 'Pick a team.' });

  // A manager books only for their own squads; an admin books for anyone.
  if (user.role !== 'admin' && !squadsForEmail(user.email).some((s) => s.id === squad.id)) {
    return back({ err: `You are not listed as the manager of ${squad.label}.` });
  }

  const end = addMinutes(start, duration);
  if (end === '24:00' || end <= start) return back({ err: 'That booking runs past midnight.' });
  if (start < settings.openingTime || end > settings.closingTime) {
    return back({
      err: `Bookings must fall between ${settings.openingTime} and ${settings.closingTime}.`,
    });
  }

  const now = today();
  if (date < now) return back({ err: 'That date is in the past.' });
  if (date > addDays(now, settings.maxWeeksAhead * 7)) {
    return back({ err: `Bookings open ${settings.maxWeeksAhead} weeks ahead.` });
  }

  const result = await create(env.DB, {
    pitch,
    date,
    start_time: start,
    end_time: end,
    squad_id: squad.id,
    team_label: squad.label,
    manager_email: squad.managerEmail,
    manager_name: squad.managerName,
    booked_by: user.email,
  });

  if (!result.ok) {
    const who = result.existing
      .map((c) => `${c.team_label} ${c.start_time}–${c.end_time}`)
      .join(', ');
    return back({
      err: `${pitches.find((p) => p.id === pitch)!.label} is already booked that day: ${who}.`,
    });
  }

  return back({ ok: `Booked ${squad.label} on ${date} at ${start}–${end}.`, week: date });
};
