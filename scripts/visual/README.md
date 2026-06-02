# Visual regression harness

Pixel-diff the built site against a reference, plus a JS-behaviour smoke test.
Used to keep refactors (e.g. the UIkit→Tailwind migration) visually identical.

Requires `playwright` + its Chromium. If not already present:

```bash
npm i -D playwright pixelmatch pngjs
npx playwright install chromium
```

## Workflow

Build and serve the candidate, capture shots, diff against a baseline.

```bash
# 1. Reference (e.g. from a clean `main` build) → .visual/baseline
npm run build
(cd dist/client && python3 -m http.server 4321 &)        # NOT wrangler — it
                                                          # can't serve a static
                                                          # _astro image dir here
node scripts/visual/shoot.mjs http://localhost:4321 .visual/baseline

# 2. Rebuild your change, re-serve, capture → .visual/current
node scripts/visual/shoot.mjs http://localhost:4321 .visual/current

# 3. Compare (exits non-zero + writes red overlays to .visual/diff on any diff)
node scripts/visual/diff.mjs .visual/baseline .visual/current

# 4. Behaviour (off-canvas, teams panel, counters)
node scripts/visual/interact.mjs http://localhost:4321
```

To capture a baseline from a *different* commit than your working tree, stash
the working changes first so the build is clean:

```bash
git stash -u && npm run build   # serve + shoot into .visual/baseline
git stash pop
```

## Notes

- `shoot.mjs` covers 8 pages × 7 widths (375/450/640/768/960/1024/1280) — the
  widths straddle every bespoke breakpoint in the legacy CSS.
- It waits 2800ms after scrolling so the home counter count-up settles;
  otherwise shots are nondeterministic and diff falsely.
- Output lives under `.visual/` (gitignored). The scripts are committed; the
  PNGs are not.
- This shell aliases `ls` to colorls — don't pipe `ls` output in helper
  commands; use `find`/`printf`.
