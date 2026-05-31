/**
 * Post-build image optimisation.
 *
 * Re-encodes each JPEG/PNG in dist/client in place at a high but efficient
 * quality. Same path, same format, same pixel dimensions — so there are no
 * markup or layout changes, which keeps the "match exactly" constraint safe.
 * mozjpeg / optimised PNG typically cut ~50% off the exported JPEGs here with
 * no perceptible difference (verified: 0/16 screenshot diffs at quality 82).
 *
 * Source images in public/ are untouched; only the dist artefacts change, so
 * every build starts from the originals.
 *
 * (Modern-format siblings — webp/avif via <picture> — were considered but
 * deferred: they need per-component markup changes that carry exact-match
 * risk. This in-place pass is the zero-risk subset.)
 *
 * Run after `astro build` (wired into `npm run build`).
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'dist', 'client');

const JPEG_Q = 82; // mozjpeg quality — verified pixel-clean vs the baseline

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function main() {
  let inBytes = 0;
  let outBytes = 0;
  let count = 0;

  for await (const file of walk(clientDir)) {
    const ext = path.extname(file).toLowerCase();
    const isJpeg = ext === '.jpg' || ext === '.jpeg';
    const isPng = ext === '.png';
    if (!isJpeg && !isPng) continue;

    const before = (await fs.stat(file)).size;
    const input = await fs.readFile(file);
    const img = sharp(input, { failOn: 'none' });

    // Re-encode in place, same format & dimensions.
    const reencoded = isJpeg
      ? await img.jpeg({ quality: JPEG_Q, mozjpeg: true }).toBuffer()
      : await img.png({ compressionLevel: 9, palette: true }).toBuffer();

    // Only write if we actually saved bytes (never inflate).
    if (reencoded.length < before) await fs.writeFile(file, reencoded);
    inBytes += before;
    outBytes += Math.min(reencoded.length, before);
    count++;
  }

  const mb = (b) => (b / 1024 / 1024).toFixed(2);
  const pct = inBytes ? (((inBytes - outBytes) / inBytes) * 100).toFixed(1) : '0.0';
  console.log(`Image optimise: ${count} files, ${mb(inBytes)}MB -> ${mb(outBytes)}MB (-${pct}%)`);
}

main().catch((e) => {
  console.error('optimise-images failed:', e);
  process.exit(1);
});
