// Renders public/og.png (1200x630) from the live phoenix scene.
// Reduced motion gives one still frame; a seeded Math.random makes the image reproducible.
// Usage: npm run build && npm run og
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4399;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const seed = `(() => { let a = 20261028; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;
const overlay = `
  main,header,footer{visibility:hidden!important}
  .og{position:fixed;z-index:10;left:72px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:26px;max-width:560px}
  .og .row{display:flex;align-items:center;gap:18px}
  .og b{font-family:var(--f-logo);font-weight:400;font-size:30px;letter-spacing:.18em}
  .og p{margin:0;font-family:var(--f-display);font-weight:700;font-size:44px;line-height:1.04;text-transform:uppercase;text-shadow:0 2px 30px rgba(0,0,0,.8)}
  .og p span{background:linear-gradient(180deg,var(--gold),var(--ember) 70%);-webkit-background-clip:text;background-clip:text;color:transparent}
  .og i{font-family:var(--f-mono);font-style:normal;font-size:15px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}`;
const html = `<div class="og"><div class="row"><svg width="56" height="56" viewBox="0 0 30 30" fill="none"><path d="M15 3 L27 27 H3 Z" stroke="#E8EDF1" stroke-width="1.5"/><path d="M15 10 L21 22 H9 Z" fill="#FF6A1A"/></svg><b>PHOENIX WORLD</b></div><p>Resurrect the way your <span>business runs.</span></p><i>AI systems for freight forwarders, customs brokers &amp; 3PLs</i></div>`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/?tier=0`, { waitUntil: 'load' });
  await page.waitForSelector('html.stage-on', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: overlay });
  await page.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), html);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(root, 'public/og.png') });
  console.log('wrote public/og.png');
} finally {
  await browser.close();
  server.kill();
}
