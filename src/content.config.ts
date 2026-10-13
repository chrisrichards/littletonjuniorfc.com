import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { personSchema, teamSchema } from './lib/content-schemas';

/*
 * Content collections for the Joomla → Astro migration.
 *
 * Sources (all extracted from the Joomla SQL dump by `scripts/migrate-from-joomla.mjs`):
 *   - pages:    long-form text content (privacy, terms, membership body, etc.)
 *   - teams:    one entry per age group with the squads + manager + email
 *   - people:   committee + age-group coordinators (single source of truth)
 *   - resources: external links + downloads grouped by section
 *
 * Settings (not collections — read directly from .json):
 *   - src/content/settings/site.json: counters, fees, current season, etc.
 */

/*
 * teams.json and people.json are edited through Pages CMS (.pages.yml), where
 * rows are reordered by dragging. So `order` is derived from the position in
 * the array rather than stored in the file — otherwise a drag would appear to
 * work in the CMS and change nothing on the site.
 *
 * Pages still sort by `data.order`. Deriving it here rather than dropping the
 * field means we don't depend on getCollection() returning entries in the
 * order the loader inserted them, which Astro doesn't guarantee.
 */
const byArrayPosition = (text: string) =>
  (JSON.parse(text) as Record<string, unknown>[]).map((entry, index) => ({
    ...entry,
    order: index,
  }));

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    hero: z.string().optional(), // path under /images/ — set up by migration script
    headerText: z.string().optional(), // overlay text on the hero (often the page title)
    description: z.string().optional(),
  }),
});

const teams = defineCollection({
  loader: file('./src/content/teams.json', { parser: byArrayPosition }),
  // Shared with the admin Teams page, which writes this file.
  schema: teamSchema.extend({
    order: z.number(), // derived from array position — not stored in the file
  }),
});

const people = defineCollection({
  loader: file('./src/content/people.json', { parser: byArrayPosition }),
  // Shared with the admin People page, which writes this file.
  schema: personSchema.extend({
    order: z.number(), // derived from array position — not stored in the file
  }),
});

const resources = defineCollection({
  loader: file('./src/content/resources.json'),
  schema: z.object({
    id: z.string(),
    section: z.string(), // "Forms & Guides", "Leagues", "The FA", "Coaching Tools"
    title: z.string(),
    description: z.string().optional(),
    href: z.string(),
    action: z.enum(['download', 'visit', 'link']),
    order: z.number(),
  }),
});

export const collections = { pages, teams, people, resources };
