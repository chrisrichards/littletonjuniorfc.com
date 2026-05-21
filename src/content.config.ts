import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

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
  loader: file('./src/content/teams.json'),
  schema: z.object({
    id: z.string(), // e.g. "u6", "u11", "pan"
    age: z.string(), // "U6", "U11", "Pan-disability"
    yearLabel: z.string(), // "Nursery / Year 1", "Year 6"
    order: z.number(),
    squads: z.array(
      z.object({
        name: z.string(), // "Hornets", "Raptors"
        managerName: z.string(),
        managerEmail: z.string(),
      })
    ),
  }),
});

const people = defineCollection({
  loader: file('./src/content/people.json'),
  schema: z.object({
    id: z.string(),
    role: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().optional(),
    group: z.enum(['committee', 'coordinator']),
    ageGroup: z.string().optional(),
    yearLabel: z.string().optional(),
    note: z.string().optional(),
    order: z.number(),
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
