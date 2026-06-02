/**
 * Pixel-diff two screenshot dirs (from shoot.mjs). Exits 1 if any differ.
 *
 * Usage: node scripts/visual/diff.mjs <dirA> <dirB> [diffOutDir]
 *   diffOutDir default .visual/diff — gets a red-overlay PNG per differing file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const A = process.argv[2];
const B = process.argv[3];
const OUT = process.argv[4] || '.visual/diff';
if (!A || !B) {
  console.error('usage: node scripts/visual/diff.mjs <dirA> <dirB> [diffOutDir]');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(A).filter((f) => f.endsWith('.png'));
let totalDiff = 0;
const rows = [];

for (const f of files) {
  const pa = path.join(A, f);
  const pb = path.join(B, f);
  if (!fs.existsSync(pb)) {
    rows.push(`MISSING in B: ${f}`);
    totalDiff++;
    continue;
  }
  const ia = PNG.sync.read(fs.readFileSync(pa));
  const ib = PNG.sync.read(fs.readFileSync(pb));
  if (ia.width !== ib.width || ia.height !== ib.height) {
    rows.push(`SIZE  ${f}: ${ia.width}x${ia.height} vs ${ib.width}x${ib.height}`);
    totalDiff++;
    continue;
  }
  const { width, height } = ia;
  const diff = new PNG({ width, height });
  const n = pixelmatch(ia.data, ib.data, diff.data, width, height, { threshold: 0.1 });
  if (n > 0) {
    fs.writeFileSync(path.join(OUT, f), PNG.sync.write(diff));
    const pct = ((n / (width * height)) * 100).toFixed(3);
    rows.push(`DIFF  ${f}: ${n} px (${pct}%)`);
    totalDiff++;
  } else {
    rows.push(`OK    ${f}`);
  }
}

console.log(rows.join('\n'));
console.log(`\n${totalDiff} file(s) differ out of ${files.length}`);
process.exit(totalDiff === 0 ? 0 : 1);
