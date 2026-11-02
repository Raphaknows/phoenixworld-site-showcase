// Regenerates the favicon set from the same PHOENIX path the 3D stage samples and the header mark uses.
//   node scripts/make-icons.mjs
// Writes public/favicon.svg, public/favicon-32.png and public/apple-touch-icon.png (180px).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const src = readFileSync('src/scripts/stage/phoenix-path.ts', 'utf8');
const PHOENIX = src.match(/PHOENIX\s*=\s*"([^"]+)"/)?.[1];
if (!PHOENIX) throw new Error('PHOENIX path not found in src/scripts/stage/phoenix-path.ts');

// 960x960 square around the mark (path spans x 59.7-940.3, y 1.1-800), on the site's dark background.
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 -80 960 960">` +
  `<defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#D9381A"/><stop offset=".5" stop-color="#FF6A1A"/><stop offset="1" stop-color="#FFBE5C"/></linearGradient></defs>` +
  `<rect x="20" y="-80" width="960" height="960" fill="#06080B"/>` +
  `<path fill="url(#g)" d="${PHOENIX}"/></svg>\n`;
writeFileSync('public/favicon.svg', svg);

const browser = await chromium.launch();
for (const [file, size] of [['public/favicon-32.png', 32], ['public/apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:#06080B"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body>`);
  await page.waitForFunction(() => document.images[0].complete);
  writeFileSync(file, await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } }));
}
await browser.close();
