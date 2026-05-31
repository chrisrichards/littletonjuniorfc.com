/**
 * Post-build CSS purge.
 *
 * theme.css ships the full UIkit + YOOtheme bundle (~393 KB) but the rebuilt
 * site uses a small fraction of it. We purge against the built HTML and JS,
 * then overwrite the copies in dist/client.
 *
 * IMPORTANT — exact-match constraint:
 *   UIkit toggles many classes at runtime (off-canvas, filter, animations,
 *   sticky header) that never appear in the static HTML. Those are listed in
 *   SAFELIST below. If a visual/interaction regression appears after a purge,
 *   the fix is almost always a missing safelist entry — add it, don't revert.
 *
 * Source theme.css in public/ is left untouched; only the built artefact is
 * shrunk, so re-running `astro build` always starts from the full bundle.
 *
 * Run after `astro build`:  node scripts/purge-css.mjs
 */
import { PurgeCSS } from 'purgecss';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'dist', 'client');
const cssDir = path.join(clientDir, 'templates', 'yootheme', 'css');

// Classes UIkit adds via JS / dynamic states that PurgeCSS can't see in HTML.
const SAFELIST = {
  standard: [
    'uk-open',
    'uk-active',
    'uk-transition-active',
    'uk-filter-hidden',
    'uk-margin-remove-adjacent',
    'tm-header-transparent',
    'tm-header-overlay',
    'tm-header-placeholder',
    'dim', // teams panel sibling-dim
    'closeMe', // teams panel close button (created in JS)
  ],
  // Whole families UIkit composes dynamically — keep them intact.
  greedy: [
    /^uk-animation/,
    /^uk-anmt/,
    /^uk-scrollspy/,
    /^uk-offcanvas/,
    /^uk-navbar/,
    /^uk-drop/,
    /^uk-dropdown/,
    /^uk-filter/,
    /^uk-transition/,
    /^uk-sticky/,
    /^uk-tab/,
    /^uk-parent/,
    /^uk-first-column/,
    /^uk-grid/,
    /^uk-width/,
    /^uk-child-width/,
    /^uk-card/,
    /^uk-section/,
    /^uk-margin/,
    /^uk-padding/,
    /^uk-text/,
    /^uk-flex/,
    /^uk-cover/,
    /^uk-position/,
    /^uk-button/,
    /^uk-container/,
    /^uk-panel/,
    /^uk-logo/,
    /^uk-icon/,
    /^uk-svg/,
    /^uk-close/,
    /^uk-totop/,
    /^uk-visible/,
    /^uk-hidden/,
    /^uk-invisible/,
    /^uk-preserve/,
    /^uk-clearfix/,
    /^uk-light/,
    /^uk-dark/,
    /^uk-width/,
    /^el-/, // YOOtheme element classes (el-item, el-content, el-image, el-nav…)
    /^tm-/,
  ],
};

async function main() {
  const targets = ['theme.css', 'custom.css'];
  const before = {};
  for (const t of targets) before[t] = (await fs.stat(path.join(cssDir, t))).size;

  const result = await new PurgeCSS().purge({
    content: [
      path.join(clientDir, '**/*.html'),
      path.join(clientDir, '**/*.js'), // keep class strings referenced in JS
    ],
    css: targets.map((t) => path.join(cssDir, t)),
    safelist: SAFELIST,
    keyframes: true,
    fontFace: true,
    variables: true,
  });

  const lines = [];
  for (const r of result) {
    const name = path.basename(r.file);
    await fs.writeFile(r.file, r.css, 'utf8');
    const after = Buffer.byteLength(r.css, 'utf8');
    const pct = ((1 - after / before[name]) * 100).toFixed(1);
    lines.push(`${name}: ${(before[name] / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB (-${pct}%)`);
  }
  console.log('PurgeCSS done:\n' + lines.join('\n'));
}

main().catch((e) => {
  console.error('purge-css failed:', e);
  process.exit(1);
});
