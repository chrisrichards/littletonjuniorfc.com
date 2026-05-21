/*
 * One-shot Joomla → Astro content migration.
 *
 * Reads the SQL dump at ../current/ljfc-db.sql, extracts the josbg_content
 * articles, and writes:
 *   src/content/pages/<slug>.md           — long-form pages (privacy, terms,
 *                                           membership, official-info,
 *                                           resources, home, teams, contact)
 *   src/content/teams.json                — squads + managers + emails
 *   src/content/people.json               — committee + coordinators
 *   src/content/resources.json            — external links + downloads
 *   src/content/settings/site.json        — counters, fees, year, pitches
 *
 * The Pitch Bookings article (id=1, alias=pitch-bookings) is skipped — that
 * page is rebuilt from scratch against Cloudflare D1.
 *
 * Idempotent: re-running overwrites the output files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DUMP_PATH = path.resolve(ROOT, '../current/ljfc-db.sql');
const CONTENT_DIR = path.join(ROOT, 'src/content');

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});

// Keep raw HTML for any tag we don't want Turndown to mangle.
// (None right now — placeholder for future use.)

// ─── 1. Parse the SQL dump ───────────────────────────────────────────

function parseInsertRows(dump, tableName) {
  // Match every `INSERT INTO `tableName` VALUES (...);` statement.
  const re = new RegExp(`INSERT INTO \`${tableName}\` VALUES (.+?);\n`, 'gs');
  const rows = [];
  let m;
  while ((m = re.exec(dump))) {
    rows.push(...splitTuples(m[1]));
  }
  return rows;
}

function splitTuples(blob) {
  // Walk the VALUES blob character-by-character respecting single-quoted
  // strings (with backslash escapes) and tuple parentheses.
  const out = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let buf = '';
  for (const ch of blob) {
    if (esc) {
      buf += ch;
      esc = false;
      continue;
    }
    if (ch === '\\') {
      buf += ch;
      esc = true;
      continue;
    }
    if (ch === "'") {
      inStr = !inStr;
      buf += ch;
      continue;
    }
    if (!inStr) {
      if (ch === '(') {
        depth += 1;
        if (depth === 1) {
          buf = '';
          continue;
        }
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          out.push(splitFields(buf));
          continue;
        }
      }
    }
    buf += ch;
  }
  return out;
}

function splitFields(row) {
  const fields = [];
  let cur = '';
  let inStr = false;
  let esc = false;
  for (const ch of row) {
    if (esc) {
      cur += ch;
      esc = false;
      continue;
    }
    if (ch === '\\') {
      cur += ch;
      esc = true;
      continue;
    }
    if (ch === "'") {
      inStr = !inStr;
      cur += ch;
      continue;
    }
    if (ch === ',' && !inStr) {
      fields.push(unquote(cur));
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(unquote(cur));
  return fields;
}

function unquote(field) {
  let s = field.trim();
  if (s === 'NULL') return null;
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// ─── 2. Pull articles from the dump ──────────────────────────────────

function loadArticles() {
  const dump = fs.readFileSync(DUMP_PATH, 'utf8');
  const rows = parseInsertRows(dump, 'josbg_content');
  const articles = rows.map((r) => ({
    id: Number(r[0]),
    title: r[2],
    alias: r[3],
    introtext: r[4],
    fulltext: r[5],
    state: Number(r[6]),
  }));
  return articles.filter((a) => a.state === 1);
}

// ─── 3. Per-page extractors ─────────────────────────────────────────

function loadHtml(html) {
  // Replace <br> with a literal " / " before parsing so cheerio's .text()
  // doesn't squash two-line headings like "Welfare<br>Officer" into one word.
  // The slash also separates squad/year labels: "Nursery<br>Year 1" → "Nursery / Year 1".
  const normalised = html.replace(/<br\s*\/?>/gi, ' / ');
  const $ = cheerio.load(normalised, { decodeEntities: true });
  // Strip the social-link placeholder ul up front so every extractor
  // doesn't have to special-case it. Three li's with facebook/twitter/
  // pinterest hrefs.
  $('ul').each((_i, el) => {
    const hrefs = $(el)
      .find('li > a')
      .map((__, a) => $(a).attr('href') || '')
      .get();
    if (
      hrefs.length === 3 &&
      hrefs.some((h) => h.includes('facebook.com')) &&
      hrefs.some((h) => h.includes('twitter.com')) &&
      hrefs.some((h) => h.includes('pinterest.com'))
    ) {
      $(el).remove();
    }
  });
  return $;
}

function extractHeroAndH1($) {
  const hero = $('img').first().attr('src') || null;
  $('img').first().remove();
  const h1Elem = $('h1').first();
  // <br> already normalised to " / " by loadHtml — collapse that for H1
  // since we want a clean header label ("Official / Info" → "Official Info").
  const headerText = h1Elem.length
    ? h1Elem.text().replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' ').trim()
    : null;
  h1Elem.remove();
  return { hero, headerText };
}

function bodyHtmlToMarkdown($) {
  // Whatever remains after hero + h1 + socials get stripped is the body.
  // Cheerio's $.html() emits a full document — pull just <body> contents.
  const bodyHtml = $('body').html() ?? $.html();
  return turndown.turndown(bodyHtml).trim();
}

/** Walk the teams page and return [{ age, yearLabel, squads: [...] }].
 *
 * The teams page interleaves:
 *   - "age-nav" <ul>s: 4 <li>s each (e.g. U6, U7, U8, U9), with a More button
 *     linking to #hidden. The <p>label tells us how many squads each age has
 *     ("Nursery" → 1, "4 Squads" → 4, "5 Squads" → 5).
 *   - "squad-block" <ul>s: one per squad. Three <li>s: squad name, manager,
 *     placeholder.
 *
 * We build a queue of (age, expectedSquads, yearLabel) from the age-navs and
 * pop entries as we walk the squad-blocks.
 */
function extractTeams($) {
  const queue = []; // [{ age, yearLabel, remaining }]
  const teams = new Map();

  function parseSquadCount(label) {
    const m = /(\d+)\s*Squads?/i.exec(label);
    if (m) return parseInt(m[1], 10);
    return 1; // "Nursery / Year 1" — single squad
  }

  $('ul').each((_i, ul) => {
    const $ul = $(ul);
    const lis = $ul.find('> li').toArray();
    if (!lis.length) return;

    // Detect age-nav: ANY <li> contains an <a href="#hidden...">More</a>.
    // We tolerate empty placeholder <li>s (the U18 nav-block has three).
    const hrefs = lis.map((li) => $(li).find('a').attr('href') || '');
    if (hrefs.some((h) => h.startsWith('#hidden'))) {
      for (const li of lis) {
        const $li = $(li);
        const heading = $li.find('h2').first().text().trim();
        const labelRaw = $li.find('p').first().text().trim().replace(/\s+/g, ' ');
        const age = /^U\d+$/i.test(heading)
          ? heading.toUpperCase()
          : /^Pan/i.test(heading)
            ? 'PAN'
            : null;
        if (!age) continue;
        const count = parseSquadCount(labelRaw);
        queue.push({ age, yearLabel: labelRaw, remaining: count });
        if (!teams.has(age)) {
          teams.set(age, {
            id: age.toLowerCase(),
            age,
            yearLabel: labelRaw,
            squads: [],
          });
        }
      }
      return;
    }

    // Otherwise: a squad-block. Pop next age off queue.
    while (queue.length && queue[0].remaining === 0) queue.shift();
    if (!queue.length) return;
    const current = queue[0];

    const squadName = $(lis[0]).find('h2').first().text().trim();
    const contactLi = $(lis[1] || lis[0]);
    const managerName = contactLi.find('p').first().text().trim();
    const mailtoHref = contactLi.find('a[href^="mailto:"]').attr('href') || '';
    const managerEmail = mailtoHref.replace(/^mailto:/i, '').trim();

    if (!squadName || !managerEmail) {
      current.remaining -= 1; // still consume the slot
      return;
    }

    const team = teams.get(current.age);
    if (team) team.squads.push({ name: squadName, managerName, managerEmail });
    current.remaining -= 1;
  });

  return Array.from(teams.values())
    .filter((t) => t.squads.length > 0)
    .map((t, i) => ({ ...t, order: i }));
}

/** Walk the contact-us page and return [{ role, name, email, phone?, group, ... }].
 *
 * Two layouts share the page:
 *   committee:   <h3>Role</h3>  <h4>Name</h4>     [optional <p>note/phone</p>]
 *   coordinator: <h3>UN</h3>    <h4>Year label</h4>  <p>Name</p>
 */
function extractPeople($) {
  const people = [];
  let order = 0;
  const seenIds = new Set();

  $('ul').each((_i, ul) => {
    $(ul).find('> li').each((__, li) => {
      const $li = $(li);
      const h3 = $li.find('h3').first().text().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' ').trim();
      const h4 = $li.find('h4').first().text().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' ').trim();
      // Skip the email-link <p> when reading body paragraphs
      const ps = $li
        .find('p')
        .toArray()
        .map((p) => {
          const $p = $(p);
          // ignore the "More" link paragraph
          if ($p.find('a[href^="mailto:"]').length && $p.text().trim().toLowerCase() === 'more') return '';
          return $p.text().replace(/\s+/g, ' ').trim();
        })
        .filter(Boolean);

      const mailtoHref = $li.find('a[href^="mailto:"]').attr('href') || '';
      const email = mailtoHref.replace(/^mailto:/i, '').trim();
      if (!h3 || !email) return;

      const ageMatch = /^U(\d+)$/i.exec(h3);
      let role, name, group, ageGroup, yearLabel, note, phone;

      if (ageMatch) {
        group = 'coordinator';
        ageGroup = h3.toUpperCase();
        role = `${ageGroup} Coordinator`;
        yearLabel = h4 || undefined;
        name = ps[0] || '';
      } else {
        group = 'committee';
        role = h3;
        name = h4;
        const noteOrPhone = ps[0];
        if (noteOrPhone) {
          if (/\b0\d{4,5}\s?\d{5,6}\b/.test(noteOrPhone)) phone = noteOrPhone;
          else note = noteOrPhone;
        }
      }

      if (!name) return;

      const id = slug(`${role}-${name}`);
      if (seenIds.has(id)) return;
      seenIds.add(id);

      people.push({
        id,
        role,
        name,
        email,
        ...(phone && { phone }),
        group,
        ...(ageGroup && { ageGroup }),
        ...(yearLabel && { yearLabel }),
        ...(note && { note }),
        order: order++,
      });
    });
  });

  return people;
}

/** Walk the resources page. Each <li> is one card.
 *
 * Section headers are <h3>s wrapped in a top-level <div> (no parent <li>),
 * e.g.  <div><h3>Forms & Guides</h3></div>. Card titles are <h3>s inside <li>.
 * We walk top-level children of body in document order.
 */
function extractResources($) {
  const resources = [];
  let order = 0;
  let currentSection = '';

  const body = $('body').length ? $('body') : $.root();

  body.contents().each((_i, node) => {
    if (node.type !== 'tag') return;

    if (node.name === 'div') {
      // Section header div — contains an <h3> directly under it
      const $h3 = $(node).children('h3').first();
      if ($h3.length) {
        const t = $h3.text().trim();
        if (t) currentSection = t;
      }
      return;
    }

    if (node.name !== 'ul') return;

    $(node)
      .find('> li')
      .each((__, li) => {
        const $li = $(li);
        const title = $li.find('h3, h4').first().text().trim();
        const description = $li.find('p').first().text().trim();
        const a = $li.find('a').first();
        const href = a.attr('href') || '';
        const label = a.text().trim().toLowerCase();
        if (!title || !href) return;

        const action =
          /download/.test(label) || /\.pdf$/i.test(href)
            ? 'download'
            : /visit/.test(label)
              ? 'visit'
              : 'link';
        resources.push({
          id: slug(`${currentSection || 'general'}-${title}`),
          section: currentSection || 'General',
          title,
          ...(description && { description }),
          href,
          action,
          order: order++,
        });
      });
  });
  return resources;
}

// ─── 3b. Corrections for known bad source data ──────────────────────

/**
 * The Joomla DB's teams article has two known errors in its year-labels.
 * Patch the extracted data in-place to match the live site's actual rosters.
 *
 *   - U10 year-label says "5 Squads" but is actually 4 (Astros belongs to U11).
 *   - U17 year-label says "2 Squads" but is actually 4 (Legends + Rebels were
 *     present after Kings but dropped by the count-based extractor).
 *
 * If/when these are fixed in the source DB, remove this function.
 */
function applyTeamCorrections(teams) {
  const u10 = teams.find((t) => t.age === 'U10');
  const u11 = teams.find((t) => t.age === 'U11');
  if (u10 && u11) {
    const astrosIdx = u10.squads.findIndex((s) => s.name === 'Astros');
    if (astrosIdx >= 0) {
      const astros = u10.squads.splice(astrosIdx, 1)[0];
      u11.squads.unshift(astros);
      u10.yearLabel = u10.yearLabel.replace(/\d+\s*Squads?/i, '4 Squads');
      u11.yearLabel = u11.yearLabel.replace(/\d+\s*Squads?/i, '5 Squads');
    }
  }

  const u17 = teams.find((t) => t.age === 'U17');
  if (u17 && u17.squads.length === 2) {
    u17.squads.push(
      { name: 'Legends', managerName: 'Paul Burgess', managerEmail: 'paul@burgeagency.com' },
      { name: 'Rebels', managerName: 'Mark Campbell', managerEmail: 'Oneanvil@gmail.com' }
    );
    u17.yearLabel = u17.yearLabel.replace(/\d+\s*Squads?/i, '4 Squads');
  }
}

// ─── 4. Helpers ──────────────────────────────────────────────────────

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  console.log(`  wrote ${path.relative(ROOT, p)}`);
}

function writeMarkdown(slugName, frontmatter, body) {
  const p = path.join(CONTENT_DIR, 'pages', `${slugName}.md`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fm = Object.entries(frontmatter)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  fs.writeFileSync(p, `---\n${fm}\n---\n\n${body}\n`);
  console.log(`  wrote ${path.relative(ROOT, p)}`);
}

// ─── 5. Main ─────────────────────────────────────────────────────────

function main() {
  console.log(`Reading ${path.relative(ROOT, DUMP_PATH)}…`);
  const articles = loadArticles();
  console.log(`Found ${articles.length} published articles.`);

  // Drop the Pitch Bookings article — replaced by D1.
  const pages = articles.filter((a) => a.alias !== 'pitch-bookings');

  // ── Pages ────────────────────────────────────────────────────────
  console.log('\nExtracting pages:');
  for (const a of pages) {
    const $ = loadHtml(a.introtext);
    const { hero, headerText } = extractHeroAndH1($);
    let body = bodyHtmlToMarkdown($);

    // Content fix: terms-conditions quotes 2019/20 fee structure (£160 with
    // £140 discount for U6/U7). Replace with the current fee structure from
    // membership.md (£200 / £180 training-only, 2025/26). See content-decisions
    // memory.
    if (a.alias === 'terms-conditions') {
      body = body.replace(
        /Cost of membership for \d{4}\/\d{2,4} is £\d+ \([^)]+\)\.\s*A summary of the benefits[^.]*\./i,
        'Cost of membership for 2025/26 is £200 for full members who play league matches, or £180 for those who only train. A summary of the benefits your membership provides can be found on our club website.'
      );
    }

    writeMarkdown(a.alias, {
      title: a.alias === 'membership' ? 'Membership' : a.title,
      ...(hero && { hero: `/${hero}` }),
      ...(headerText && { headerText }),
    }, body);
  }

  // ── Teams (extracted from teams introtext) ───────────────────────
  console.log('\nExtracting teams:');
  const teamsArticle = pages.find((a) => a.alias === 'teams');
  if (teamsArticle) {
    const $ = loadHtml(teamsArticle.introtext);
    extractHeroAndH1($); // throw away header
    const teams = extractTeams($);
    applyTeamCorrections(teams);
    writeJSON(path.join(CONTENT_DIR, 'teams.json'), teams);
    console.log(`  ${teams.length} age groups, ${teams.reduce((n, t) => n + t.squads.length, 0)} squads`);
  }

  // ── People (extracted from contact-us introtext) ─────────────────
  console.log('\nExtracting people:');
  const contactArticle = pages.find((a) => a.alias === 'contact-us');
  if (contactArticle) {
    const $ = loadHtml(contactArticle.introtext);
    extractHeroAndH1($);
    const people = extractPeople($);
    writeJSON(path.join(CONTENT_DIR, 'people.json'), people);
    console.log(`  ${people.length} people (${people.filter((p) => p.group === 'committee').length} committee, ${people.filter((p) => p.group === 'coordinator').length} coordinators)`);
  }

  // ── Resources (extracted from resources introtext) ───────────────
  console.log('\nExtracting resources:');
  const resourcesArticle = pages.find((a) => a.alias === 'resources');
  if (resourcesArticle) {
    const $ = loadHtml(resourcesArticle.introtext);
    extractHeroAndH1($);
    const resources = extractResources($);
    writeJSON(path.join(CONTENT_DIR, 'resources.json'), resources);
    console.log(`  ${resources.length} resource entries across ${new Set(resources.map((r) => r.section)).size} sections`);
  }

  // ── Site settings ────────────────────────────────────────────────
  console.log('\nWriting settings:');
  writeJSON(path.join(CONTENT_DIR, 'settings/site.json'), {
    club: {
      name: 'Littleton Junior Football Club',
      shortName: 'Littleton Junior FC',
      tagline: 'Fun. Friendship. Football.',
      foundedYear: 1974,
      currentSeason: '2025/26',
    },
    counters: {
      players: 614,
      coaches: 113,
      teams: 43,
      clubs: 1,
    },
    fees: {
      full: 200,
      trainingOnly: 180,
      currency: 'GBP',
      season: '2025/26',
    },
    pitches: ['nursery', 'top', 'middle', 'bottom'],
  });

  console.log('\nDone.');
}

main();
