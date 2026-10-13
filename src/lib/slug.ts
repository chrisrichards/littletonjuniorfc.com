/*
 * Squad ids are derived, not stored: `u13` + "Broncos" -> u13-broncos. Bookings
 * reference squads by this id, so the booking system (squads.ts) and the admin
 * Teams page (which warns when a rename would orphan bookings) must agree on it.
 * Kept free of `cloudflare:workers` so it can be imported anywhere.
 */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function squadId(groupId: string, squadName: string): string {
  return `${groupId}-${slug(squadName)}`;
}
