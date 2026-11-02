import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PHOENIX } from '../src/scripts/stage/phoenix-path';

const size = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });

test.describe('phoenix logo mark', () => {
  for (const path of ['/', '/privacy/', '/nope']) {
    test(`${path}: one #phx-mark symbol from the stage's PHOENIX path, used by header and footer`, async ({ page }) => {
      await page.goto(path);
      expect(await page.locator('symbol#phx-mark').count()).toBe(1);
      expect(await page.locator('symbol#phx-mark').getAttribute('viewBox')).toBe('40 0 920 810');
      expect(await page.locator('symbol#phx-mark path').getAttribute('d')).toBe(PHOENIX);
      const stops = await page.locator('#phx-grad stop').evaluateAll((s) => s.map((e) => e.getAttribute('stop-color')));
      expect(stops).toEqual(['#D9381A', '#FF6A1A', '#FFBE5C']); // bottom, middle, top
      await expect(page.locator('header a.logo use')).toHaveAttribute('href', '#phx-mark');
      await expect(page.locator('footer a.logo use')).toHaveAttribute('href', '#phx-mark');
      await expect(page.locator('.logo svg.mark')).toHaveCount(2);
    });
  }

  test('sizes: header mark 40x35 on desktop and phone; footer 30x26', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    expect(await size(page, 'header .logo svg.mark')).toEqual([40, 35]);
    expect(await size(page, 'footer .logo svg.mark')).toEqual([30, 26]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await size(page, 'header .logo svg.mark')).toEqual([40, 35]);
  });

  test('the mark actually paints (gradient, not an empty box)', async ({ page }) => {
    await page.goto('/');
    const shot = await page.locator('header .logo svg.mark').screenshot();
    expect(shot.length).toBeGreaterThan(600);
  });

  test('logo links keep their accessible names', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Phoenix World home' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Phoenix World, back to top' })).toHaveCount(1);
  });

  test('favicon set is generated from the same path', async ({ request }) => {
    const svg = readFileSync('public/favicon.svg', 'utf8');
    expect(svg).toContain(PHOENIX);
    for (const c of ['#D9381A', '#FF6A1A', '#FFBE5C']) expect(svg).toContain(c);
    const png = (f: string) => readFileSync(f);
    const dims = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];
    expect(dims(png('public/favicon-32.png'))).toEqual([32, 32]);
    expect(dims(png('public/apple-touch-icon.png'))).toEqual([180, 180]);
    for (const [url, type] of [['/favicon.svg', 'image/svg+xml'], ['/favicon-32.png', 'image/png'], ['/apple-touch-icon.png', 'image/png']]) {
      const r = await request.get(url);
      expect(r.status(), url).toBe(200);
      expect(r.headers()['content-type'], url).toContain(type);
    }
  });

  test('head links the icons', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
    await expect(page.locator('link[rel="icon"][href="/favicon-32.png"][sizes="32x32"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"][href="/apple-touch-icon.png"]')).toHaveCount(1);
  });
});

test.describe('header: logo and wordmark only, transparent, not sticky', () => {
  const bar = (page: Page) => page.locator('header.bar');
  const sizes = [[360, 800], [390, 844], [1280, 800]] as const;
  for (const [w, h] of sizes) {
    test(`${w}px: only the logo link, no nav, no button, no bar colour or border, one row, no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await expect(page.locator('header nav')).toHaveCount(0);
      await expect(page.locator('header .btn')).toHaveCount(0);
      await expect(page.locator('header a')).toHaveCount(1);
      await expect(page.locator('header a.logo')).toHaveAttribute('href', '#top');
      await expect(page.locator('header a.logo')).toHaveAttribute('aria-label', 'Phoenix World home');
      await expect(page.locator('header a.logo')).toContainText('PHOENIX WORLD');
      const m = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('header.bar')!);
        const logo = document.querySelector('header .logo')!.getBoundingClientRect();
        const word = document.querySelector('header .logo b')!.getBoundingClientRect();
        const mark = document.querySelector('header .logo svg')!.getBoundingClientRect();
        return {
          bg: cs.backgroundColor, bgImage: cs.backgroundImage, border: cs.borderBottomWidth, backdrop: cs.backdropFilter, pos: cs.position,
          oneRow: Math.abs((mark.top + mark.bottom) / 2 - (word.top + word.bottom) / 2) < 4, fits: logo.right <= innerWidth - 12,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(m.bg).toBe('rgba(0, 0, 0, 0)');
      expect(m.bgImage).toBe('none');
      expect(m.border).toBe('0px');
      expect(m.backdrop).toBe('none');
      expect(['static', 'relative']).toContain(m.pos); // in the flow, never sticky or fixed
      expect(m.oneRow && m.fits).toBe(true);
      expect(m.overflow).toBe(false);
    });
  }

  test('not sticky: scrolls away with the page, on every size, and nothing hides or shows it', async ({ page }) => {
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.evaluate(() => scrollTo({ top: 1200, behavior: 'instant' as ScrollBehavior }));
      expect(await bar(page).evaluate((e) => Math.round(e.getBoundingClientRect().bottom)), `${w}px`).toBeLessThan(0);
      await page.evaluate(() => scrollTo({ top: 1000, behavior: 'instant' as ScrollBehavior })); // scrolling up does not bring it back
      expect(await bar(page).evaluate((e) => Math.round(e.getBoundingClientRect().bottom)), `${w}px up`).toBeLessThan(0);
      await expect(bar(page)).not.toHaveClass(/bar-hidden/);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
      expect(await bar(page).evaluate((e) => Math.round(e.getBoundingClientRect().top)), `${w}px top`).toBe(0);
    }
  });

  test('readable over the phoenix: the mark and wordmark carry a dark halo', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('header .logo svg.mark').evaluate((e) => getComputedStyle(e).filter)).toContain('drop-shadow');
    expect(await page.locator('header .logo b').evaluate((e) => getComputedStyle(e).textShadow)).not.toBe('none');
  });

  test('the logo link returns to the top', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => scrollTo({ top: 1500, behavior: 'instant' as ScrollBehavior }));
    await page.evaluate(() => (document.querySelector('header a.logo') as HTMLElement).click());
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 8000 }).toBeLessThan(5);
  });

  test('same header on the privacy page and the 404', async ({ page }) => {
    for (const path of ['/privacy/', '/nope']) {
      await page.goto(path);
      await expect(page.locator('header a')).toHaveCount(1);
      await expect(page.locator('header nav, header .btn')).toHaveCount(0);
      expect(await bar(page).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    }
  });
});

test.describe('hero HUD line', () => {
  test('hidden at 899px and below, shown on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 800 });
    await page.goto('/');
    await expect(page.locator('.hud-row.top')).toBeHidden();
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.locator('.hud-row.top')).toBeHidden();
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.locator('.hud-row.top')).toBeVisible();
    await expect(page.locator('.hud-row.top')).toContainText('PHX-01');
    await expect(page.locator('.hud-row.top')).toContainText('25.7617° N');
  });
});

test.describe('page edges', () => {
  for (const [w, path] of [[1280, '/'], [390, '/'], [390, '/privacy/']] as const) {
    test(`no default body margin and the header spans the full width at ${w}px (${path})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto(path);
      expect(await page.evaluate(() => getComputedStyle(document.body).margin)).toBe('0px');
      const bar = await page.locator('header.bar').evaluate((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width]; });
      expect(bar).toEqual([0, 0, w]);
    });
  }
});
