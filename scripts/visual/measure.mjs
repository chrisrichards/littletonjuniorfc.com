// Dump getComputedStyle for a set of selectors on a page, at one or more
// widths. Ground-truth for reproducing the legacy UIkit styling exactly.
//
//   node scripts/visual/measure.mjs <baseUrl> <path> <width[,width...]> <sel> [sel...]
//
// Example:
//   node scripts/visual/measure.mjs http://localhost:4321 / 1280,375 \
//     '.uk-section' '.uk-container' '.uk-card-body'
//
// Prints, per width per selector, the first matching element's relevant
// computed properties (box model, typography, colour, flex/grid, position).

import { chromium } from 'playwright';

const [, , base, path, widthsArg, ...selectors] = process.argv;
if (!base || !path || !widthsArg || selectors.length === 0) {
  console.error('usage: measure.mjs <baseUrl> <path> <w[,w...]> <sel> [sel...]');
  process.exit(2);
}
const widths = widthsArg.split(',').map((n) => parseInt(n, 10));

const PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'inset',
  'box-sizing', 'width', 'height', 'min-height', 'max-width',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-top-style', 'border-top-color',
  'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
  'border-radius',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'letter-spacing', 'text-align', 'text-transform', 'white-space',
  'color', 'background-color', 'background-image',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
  'gap', 'column-gap', 'row-gap',
  'grid-template-columns', 'grid-auto-rows',
  'object-fit', 'overflow', 'transform', 'opacity', 'z-index', 'box-shadow',
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const w of widths) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  console.log(`\n================ width ${w} : ${path} ================`);
  for (const sel of selectors) {
    const data = await page.evaluate(
      ({ sel, PROPS }) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const out = {};
        const r = el.getBoundingClientRect();
        out['@rect'] = `x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.width.toFixed(1)} h=${r.height.toFixed(1)}`;
        for (const p of PROPS) out[p] = cs.getPropertyValue(p);
        // pseudo-elements too
        const before = getComputedStyle(el, '::before');
        const after = getComputedStyle(el, '::after');
        const pseudo = (cs2) => {
          const o = {};
          for (const p of ['content', ...PROPS]) o[p] = cs2.getPropertyValue(p);
          return o;
        };
        return {
          main: out,
          before: before.content !== 'none' ? pseudo(before) : null,
          after: after.content !== 'none' ? pseudo(after) : null,
        };
      },
      { sel, PROPS }
    );
    if (!data) {
      console.log(`\n[${sel}] — NOT FOUND`);
      continue;
    }
    // Site-global inherited/initial noise to suppress (these are the body
    // defaults that show up on nearly every element).
    const NOISE = {
      display: 'block', position: 'static', 'box-sizing': 'content-box',
      'border-top-color': 'rgb(113, 113, 113)', 'border-bottom-color': 'rgb(113, 113, 113)',
      'border-top-style': 'none', 'border-bottom-style': 'none',
      'font-family': 'TradeGothic', 'font-size': '14px', 'font-weight': '400',
      'line-height': '23.8px', 'text-align': 'start', color: 'rgb(113, 113, 113)',
      'background-color': 'rgba(0, 0, 0, 0)', 'flex-direction': 'row',
      'flex-wrap': 'nowrap', 'object-fit': 'fill', overflow: 'visible',
      opacity: '1', transform: 'none', 'background-image': 'none',
    };
    const show = (obj, indent) => {
      for (const [k, v] of Object.entries(obj)) {
        if (!v || v === 'normal' || v === 'auto' || v === 'none' || v === '0px') continue;
        if (NOISE[k] === v) continue;
        console.log(`${indent}${k}: ${v}`);
      }
    };
    console.log(`\n[${sel}]`);
    show(data.main, '  ');
    for (const which of ['before', 'after']) {
      const p = data[which];
      // skip clearfix table pseudos (content "" + display table/table-cell)
      if (!p) continue;
      if (p.content === '""' && (p.display === 'table' || p.display === 'table-cell')) continue;
      console.log(`  ::${which} (content=${p.content})`);
      show(p, '    ');
    }
  }
}

await browser.close();
