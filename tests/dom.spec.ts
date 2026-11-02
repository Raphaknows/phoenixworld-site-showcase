import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

test.describe('burn calculator', () => {
  test('defaults match the design', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#r-cost')).toHaveText('$120,000');
    await expect(page.locator('#r-hours')).toHaveText('4,000');
    await expect(page.locator('#r-save')).toHaveText('$60,000');
    await expect(page.locator('#r-save-h')).toHaveText('2,000 hours');
    // the form's amber line stays hidden until the visitor changes an input
    await expect(page.locator('#formEstimate')).toBeHidden();
  });

  test('inputs drive outputs and the heat bar', async ({ page }) => {
    await page.goto('/');
    const heat = () => page.locator('#heatBar').evaluate((e) => (e as HTMLElement).style.getPropertyValue('--h'));
    const before = parseFloat(await heat());
    await page.fill('#c-people', '10');
    await page.fill('#c-rate', '50');
    await expect(page.locator('#r-cost')).toHaveText('$500,000');
    expect(parseFloat(await heat())).toBeGreaterThan(before);
    await page.locator('#c-share').fill('80');
    await expect(page.locator('#o-share')).toHaveText('80%');
    await expect(page.locator('#r-save')).toHaveText('$400,000');
  });
});

test.describe('blueprint library', () => {
  test('filters and count', async ({ page }) => {
    await page.goto('/');
    const visible = () => page.locator('.bp:not([hidden])').count();
    expect(await visible()).toBe(10);
    await page.click('.chip[data-cat="logistics"]');
    expect(await visible()).toBe(3);
    await expect(page.locator('#bpCount')).toHaveText('3');
    await expect(page.locator('.chip[data-cat="logistics"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('.chip[data-cat="hospitality"]');
    expect(await visible()).toBe(2);
    await page.click('.chip[data-cat="all"]');
    expect(await visible()).toBe(10);
  });

  test('"Build this for us" preselects the workflow and shows the pick', async ({ page }) => {
    await page.goto('/');
    await page.locator('.bp[data-cat="logistics"] .btn', { hasText: 'Build this for us' }).nth(1).click();
    await expect(page.locator('#formInterest')).toBeVisible();
    await expect(page.locator('#formInterest')).toHaveText('Blueprint you picked: Rate quote engine.');
    await expect(page.locator('#f-workflow')).toHaveValue('Quotes from email');
  });

  test('security pack button sets its own note', async ({ page }) => {
    await page.goto('/');
    await page.click('.pack .btn');
    await expect(page.locator('#formInterest')).toContainText('security pack');
    await expect(page.locator('#f-workflow')).toHaveValue('Something else');
  });
});

test.describe('company name personalisation', () => {
  test('#for-company-name link', async ({ page }) => {
    await page.goto('/#for-acme-freight');
    await expect(page.locator('#prepared')).toHaveText('Prepared for Acme Freight');
    await expect(page.locator('#f-co')).toHaveValue('Acme Freight');
    await expect(page.locator('#f-company')).toHaveValue('Acme Freight');
    await expect(page.locator('.chip[data-cat="logistics"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.bp:not([hidden])').count()).toBe(3);
  });

  test('slugs are lowercase-only: an uppercase link is ignored', async ({ page }) => {
    await page.goto('/#for-DHL-global');
    await expect(page.locator('#prepared')).toBeHidden();
    await expect(page.locator('#f-company')).toHaveValue('');
  });

  test('igniter form copies the name to the audit form without the "Prepared for" line', async ({ page }) => {
    await page.goto('/');
    await page.fill('#f-co', 'Miami Cargo');
    await page.click('#igniter button');
    await expect(page.locator('#f-company')).toHaveValue('Miami Cargo');
    await expect(page.locator('#prepared')).toBeHidden();
  });
});

test.describe('extra pages', () => {
  test('privacy page is linked from the footer and the form, and has the contact email and retention text', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer a[href="/privacy/"]')).toBeVisible();
    await expect(page.locator('#auditForm a[href="/privacy/"]')).toBeVisible();
    await page.click('footer a[href="/privacy/"]');
    await expect(page).toHaveURL(/\/privacy\/$/);
    await expect(page.locator('h1')).toHaveText('Privacy');
    await expect(page.locator('main a[href="mailto:hello@phoenixworld.ai"]')).toHaveCount(2);
    await expect(page.locator('main')).toContainText('kept for up to 12 months and then deleted');
    await expect(page.locator('main')).toContainText('deleted within 30 days after the engagement ends');
    await expect(page.locator('main')).toContainText('Formspree');
    await expect(page.locator('main')).toContainText('Cloudflare Web Analytics');
  });

  test('404 page is styled and links home', async ({ page }) => {
    const res = await page.goto('/does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toContainText('Nothing here but ashes.');
    await page.click('main a.btn');
    await expect(page).toHaveURL(/\/$/);
  });

  test('the header logo on subpages goes home', async ({ page }) => {
    await page.goto('/privacy/');
    await expect(page.locator('header a.logo')).toHaveAttribute('href', '/#top');
  });
});

test.describe('SEO', () => {
  test('home head', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toContain('Phoenix World');
    expect(title.length).toBeLessThanOrEqual(75);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc!.length).toBeGreaterThan(80);
    expect(desc!.length).toBeLessThanOrEqual(160);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://phoenixworld.ai/');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://phoenixworld.ai/og.png');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('every indexable page canonicalises to the https://phoenixworld.ai version of itself', async ({ page }) => {
    for (const [path, href] of [['/', 'https://phoenixworld.ai/'], ['/privacy/', 'https://phoenixworld.ai/privacy/']]) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute('href', href);
    }
  });

  test('og.png is 1200x630', async ({ request }) => {
    const res = await request.get('/og.png');
    expect(res.ok()).toBe(true);
    const buf = await res.body();
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });

  test('sitemap lists home and privacy but not the 404', async ({ request }) => {
    const idx = await (await request.get('/sitemap-index.xml')).text();
    expect(idx).toContain('https://phoenixworld.ai/sitemap-0.xml');
    const map = await (await request.get('/sitemap-0.xml')).text();
    expect(map).toContain('<loc>https://phoenixworld.ai/</loc>');
    expect(map).toContain('<loc>https://phoenixworld.ai/privacy/</loc>');
    expect(map).not.toContain('404');
  });

  test('robots.txt points to the sitemap; 404 is noindex', async ({ request, page }) => {
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://phoenixworld.ai/sitemap-index.xml');
    await page.goto('/nope');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });
});

// Web Analytics runs through Cloudflare's automatic setup, which injects the beacon at the edge.
// The build must never add its own, or every visit is counted twice.
const builtFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? builtFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const textFiles = (dir: string) => builtFiles(dir).filter((f) => /\.(html|js|mjs|css|xml|txt|json)$/.test(f));

test.describe('no Web Analytics beacon in the build', () => {
  test('no built file references cloudflareinsights or data-cf-beacon', () => {
    const dist = path.join(process.cwd(), 'dist');
    const files = textFiles(dist);
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const body = fs.readFileSync(f, 'utf8');
      expect(body, f).not.toContain('cloudflareinsights');
      expect(body, f).not.toContain('data-cf-beacon');
    }
  });

  test('setting PUBLIC_CF_BEACON_TOKEN does not bring a beacon back', () => {
    const out = path.join(process.cwd(), 'dist-test');
    try {
      execFileSync('npx', ['astro', 'build', '--outDir', out], { env: { ...process.env, PUBLIC_CF_BEACON_TOKEN: 'tok123abc' }, stdio: 'ignore' });
      for (const f of textFiles(out)) {
        const body = fs.readFileSync(f, 'utf8');
        expect(body, f).not.toContain('cloudflareinsights');
        expect(body, f).not.toContain('tok123abc');
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  test('no beacon request or script in the browser, and no Vercel code', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => /cloudflareinsights|_vercel/.test(r.url()) && hits.push(r.url()));
    await page.goto('/');
    await page.waitForSelector('html.stage-on');
    expect(hits).toEqual([]);
    expect(await page.locator('script[data-cf-beacon]').count()).toBe(0);
    expect(fs.readFileSync(path.join(process.cwd(), 'dist/index.html'), 'utf8')).not.toContain('_vercel');
  });
});

test('Cloudflare Pages config: _headers caches hashed assets and the 404 page is built', async ({ request }) => {
  const headers = fs.readFileSync(path.join(process.cwd(), 'dist/_headers'), 'utf8');
  expect(headers).toContain('/_astro/*');
  expect(headers).toContain('immutable');
  expect(fs.existsSync(path.join(process.cwd(), 'dist/404.html'))).toBe(true);
  expect((await request.get('/privacy/')).ok()).toBe(true);
});
