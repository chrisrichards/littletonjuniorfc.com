import { z } from 'astro/zod';

/*
 * The stored shape of people.json and teams.json — one definition shared by
 * the content collections (src/content.config.ts) and the admin pages that
 * write these files (src/pages/admin/), so an admin save can't produce a file
 * the build would then reject.
 *
 * `order` is not stored: content.config.ts derives it from array position.
 */

export const personSchema = z.object({
  id: z.string(),
  role: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  group: z.enum(['committee', 'coordinator']),
  ageGroup: z.string().optional(),
  yearLabel: z.string().optional(),
  note: z.string().optional(),
});

export const squadSchema = z.object({
  name: z.string(), // "Hornets", "Raptors"
  managerName: z.string(),
  managerEmail: z.string(),
});

export const teamSchema = z.object({
  id: z.string(), // e.g. "u6", "u11"
  age: z.string(), // "U6", "U11"
  yearLabel: z.string(), // "Nursery / Year 1", "4 Squads / Year 6"
  squads: z.array(squadSchema),
});

export type Person = z.infer<typeof personSchema>;
export type Squad = z.infer<typeof squadSchema>;
export type Team = z.infer<typeof teamSchema>;

/*
 * People that Official Info reads by id (src/pages/official-info.astro). The
 * admin People page refuses to delete these or save without them, since the
 * build fails when one is missing.
 */
export const officialInfoPeople = {
  chair: 'chairman',
  secretary: 'secretary',
  treasurer: 'treasurer',
  welfare: 'welfare-officer',
} as const;
