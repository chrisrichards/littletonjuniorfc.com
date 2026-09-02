/**
 * Smoke-test the three JS behaviours that screenshots can't catch.
 * Exits 1 on any failure.
 *
 * Usage: node scripts/visual/interact.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4321';
const browser = await chromium.launch();
const out = [];
let fail = 0;

// 1. Teams "More" panel opens (our own inline slide script) + close button.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/teams/', { waitUntil: 'networkidle' });
  const target = await page.getAttribute('a[data-panel-target]', 'data-panel-target');
  await page.click('a[data-panel-target]');
  await page.waitForTimeout(700);
  const visible = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).display !== 'none' && r.height > 10;
  }, target);
  out.push(`[${visible ? 'PASS' : 'FAIL'}] teams panel "${target}" opens`);
  if (!visible) fail++;
  const hasClose = await page.evaluate((id) => !!document.getElementById(id)?.querySelector('.closeMe'), target);
  out.push(`[${hasClose ? 'PASS' : 'FAIL'}] teams panel close button added`);
  if (!hasClose) fail++;
  await ctx.close();
}

// 2. Mobile drawer opens (adds .is-open to #mobile-drawer).
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.click('[data-drawer-open]');
  await page.waitForTimeout(700);
  const open = await page.evaluate(() => document.getElementById('mobile-drawer')?.classList.contains('is-open'));
  out.push(`[${open ? 'PASS' : 'FAIL'}] mobile drawer opens`);
  if (!open) fail++;
  await ctx.close();
}

// 3. Counters animate to their final values (inline RAF script ran).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const vals = await page.evaluate(() =>
    [...document.querySelectorAll('.counter')].map((e) => e.textContent.trim())
  );
  const ok = vals.join(',') === '614,113,43,1';
  out.push(`[${ok ? 'PASS' : 'FAIL'}] counters reached final values: ${vals.join(',')}`);
  if (!ok) fail++;
  await ctx.close();
}

await browser.close();
console.log(out.join('\n'));
console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
