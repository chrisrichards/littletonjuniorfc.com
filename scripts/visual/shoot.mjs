/**
 * Full-page screenshots of every page at the breakpoints that matter.
 *
 * Usage: node scripts/visual/shoot.mjs <baseUrl> <outDir>
 *   baseUrl  default http://localhost:4321 (serve dist/client there first)
 *   outDir   default .visual/shots
 *
 * Serve a build with:  (cd dist/client && python3 -m http.server 4321)
 * Note: trailing slashes on routes matter for the static server.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = process.argv[2] || 'http://localhost:4321';
const OUT = process.argv[3] || '.visual/shots';

const PAGES = [
  ['home', '/'],
  ['teams', '/teams/'],
  ['official-info', '/official-info/'],
  ['membership', '/membership/'],
  ['resources', '/resources/'],
  ['contact-us', '/contact-us/'],
  ['privacy-policy', '/privacy-policy/'],
  ['terms-conditions', '/terms-conditions/'],
];

// Widths straddle every bespoke breakpoint in the live CSS
// (376/450/640/768/959/960/1024/1152) plus a desktop width.
const WIDTHS = [375, 450, 640, 768, 960, 1024, 1280];

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function autoScroll(page) {
  // Force any lazy/below-the-fold content to load before the full-page shot.
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + 1000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 50);
    });
  });
}

for (const w of WIDTHS) {
  // reducedMotion trips the on-scroll scrollspy gate so cards render in their
  // final fully-visible state — deterministic layout shots (no fade caught
  // mid-animation, which otherwise makes card pages flaky e.g. teams@1024).
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  for (const [name, path] of PAGES) {
    const file = `${OUT}/${name}__${w}.png`;
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
      await autoScroll(page);
      // The home counters count up over ~2000ms on DOMContentLoaded; wait long
      // enough that they've settled or the shot is nondeterministic.
      await page.waitForTimeout(2800);
      await page.screenshot({ path: file, fullPage: true });
    } catch (e) {
      console.log('FAIL', path, w, '-', e.message.split('\n')[0]);
    }
  }
  await ctx.close();
  console.log('width', w, 'done');
}

await browser.close();
console.log('DONE');
