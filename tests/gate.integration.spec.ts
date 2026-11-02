// The real built site under Cloudflare's Pages runtime (wrangler pages dev, i.e. workerd), with the gate on.
import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';

const PW = 'integration-test-password';
const GATED = 8791;
const UNCONFIGURED = 8792;
const GATE_OFF = 8793; // how Production and Preview run now: gate off, search engines blocked
const LAUNCHED = 8794; // launch: gate off, NOINDEX=false
const procs: ChildProcess[] = [];

async function start(port: number, bindings: string[], extra: string[] = []): Promise<void> {
  const p = spawn('npx', ['wrangler', 'pages', 'dev', 'dist', '--port', String(port), '--compatibility-date=2025-01-01', '--inspector-port', String(port + 1000), '--persist-to', `.wrangler/state-${port}`, ...extra, ...bindings.flatMap((b) => ['--binding', b])], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  procs.push(p);
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(`http://localhost:${port}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`wrangler did not start on ${port}`);
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await start(GATED, [`PREVIEW_PASSWORD=${PW}`]);
  await start(UNCONFIGURED, []);
  await start(GATE_OFF, ['GATE_DISABLED=true', 'NOINDEX=true']);
  await start(LAUNCHED, ['GATE_DISABLED=true', 'NOINDEX=false']);
});
test.afterAll(() => {
  for (const p of procs) try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* already gone */ }
});

const url = (path = '/') => `http://localhost:${GATED}${path}`;

test.describe('gate on the real Pages runtime', () => {
  test('no credentials: 401 + Basic challenge + noindex, for every path', async ({ request }) => {
    for (const path of ['/', '/privacy/', '/robots.txt', '/sitemap-index.xml', '/og.png', '/does-not-exist', '/_astro/anything.js']) {
      const r = await request.get(url(path));
      expect(r.status(), path).toBe(401);
      expect(r.headers()['www-authenticate'], path).toMatch(/^Basic realm=/);
      expect(r.headers()['x-robots-tag'], path).toContain('noindex');
    }
  });

  test('wrong password: 401', async ({ request }) => {
    const r = await request.get(url('/'), { headers: { Authorization: 'Basic ' + Buffer.from('me:wrong').toString('base64') } });
    expect(r.status()).toBe(401);
  });

  test.describe('with the password', () => {
    test.use({ httpCredentials: { username: 'me', password: PW } });

    test('home loads, stage runs, calculator and form work through the gate', async ({ page }) => {
      const failures: string[] = [];
      page.on('response', (r) => r.status() >= 400 && failures.push(`${r.status()} ${r.url()}`));
      await page.route('https://formspree.io/f/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      await page.goto(url('/'));
      await expect(page.locator('h1')).toContainText('Resurrect the way your');
      await page.waitForSelector('html.stage-on', { timeout: 20000 });
      await expect(page.locator('#r-cost')).toHaveText('$120,000');
      await page.fill('#f-name', 'Ana');
      await page.fill('#f-company', 'Santos Freight');
      await page.fill('#f-email', 'ana@example.com');
      await page.click('#auditForm button[type=submit]');
      await expect(page.locator('#formStatus')).toContainText('Request received');
      expect(failures).toEqual([]);
    });

    test('other pages, 404 page, noindex header, immutable asset cache', async ({ page, request }) => {
      await page.goto(url('/privacy/'));
      await expect(page.locator('h1')).toHaveText('Privacy');
      const res = await page.goto(url('/nope'));
      expect(res?.status()).toBe(404);
      await expect(page.locator('h1')).toContainText('Nothing here but ashes.');
      const home = await page.request.get(url('/'));
      expect(home.headers()['x-robots-tag']).toContain('noindex');
      const html = await home.text();
      const asset = /\/_astro\/[^"']+\.js/.exec(html)![0];
      const a = await page.request.get(url(asset));
      expect(a.status()).toBe(200);
      expect(a.headers()['cache-control']).toContain('immutable');
    });

    test('deep links still work behind the gate (hash survives the auth prompt)', async ({ page }) => {
      await page.goto(url('/#for-acme-logistics--bp-01'));
      await expect(page.locator('#prepared span.suggest')).toHaveText('Suggested system: Customs entry copilot');
    });
  });

  test('no password configured: fails closed with 503, never serves the site', async ({ request }) => {
    for (const path of ['/', '/privacy/']) {
      const r = await request.get(`http://localhost:${UNCONFIGURED}${path}`, { headers: { Authorization: 'Basic ' + Buffer.from('me:anything').toString('base64') } });
      expect(r.status(), path).toBe(503);
      expect(await r.text()).not.toContain('Phoenix');
    }
  });
});

test.describe('gate off + NOINDEX switch on the real Pages runtime', () => {
  test('GATE_DISABLED=true, NOINDEX=true: pages open with no password and carry noindex, nofollow', async ({ request }) => {
    for (const path of ['/', '/privacy/', '/does-not-exist', '/version.txt', '/robots.txt']) {
      const r = await request.get(`http://localhost:${GATE_OFF}${path}`);
      expect(r.status(), path).not.toBe(401);
      expect(r.status(), path).not.toBe(503);
      expect(r.headers()['x-robots-tag'], path).toBe('noindex, nofollow');
    }
    expect((await request.get(`http://localhost:${GATE_OFF}/`)).status()).toBe(200);
  });
  test('NOINDEX=false (launch): no X-Robots-Tag anywhere, site still open', async ({ request }) => {
    for (const path of ['/', '/privacy/', '/version.txt']) {
      const r = await request.get(`http://localhost:${LAUNCHED}${path}`);
      expect(r.status(), path).toBe(200);
      expect(r.headers()['x-robots-tag'], path).toBeUndefined();
    }
  });
});
