import { expect, test } from '@playwright/test';

const errors = (page: import('@playwright/test').Page) => {
  const list: string[] = [];
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
  return list;
};

test.describe('stage (WebGL)', () => {
  test('loads on demand, intro completes, no errors', async ({ page }) => {
    const errs = errors(page);
    await page.goto('/');
    await page.waitForSelector('html.stage-on');
    await expect(page.locator('#seqPct')).toHaveText('100%', { timeout: 8000 });
    await expect(page.locator('#seqState')).toHaveText('Ashes → Phoenix');
    await page.mouse.move(900, 400);
    await page.mouse.click(300, 500); // click burst in empty space
    await page.waitForTimeout(300);
    expect(errs).toEqual([]);
  });

  test('scroll drives the state label through all three scenes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html.stage-on');
    await page.evaluate(() => scrollTo(0, document.querySelector('.hero')!.clientHeight));
    await expect(page.locator('#seqState')).toHaveText('Phoenix → Systems');
    await page.evaluate(() => document.getElementById('audit')!.scrollIntoView({ behavior: 'instant' as ScrollBehavior }));
    await expect(page.locator('#seqState')).toHaveText('Systems → Phoenix');
  });

  test('ignite spells the company name, including a #for- link opened before the stage loads', async ({ page }) => {
    await page.goto('/#for-acme-freight');
    await page.waitForSelector('html.stage-on');
    await expect(page.locator('#seqState')).toHaveText('Reborn: ACME FREIGHT', { timeout: 10000 });
  });

  test('canvas is hidden until the stage is ready', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html.stage-on');
    await expect(page.locator('#stage')).toHaveCSS('opacity', '1');
  });
});

test.describe('no-WebGL fallback', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...a: unknown[]) {
        if (/webgl/.test(type)) return null;
        return (orig as Function).call(this, type, ...a);
      } as typeof orig;
    });
  });

  test('canvas hidden, sequence complete, page fully usable', async ({ page }) => {
    const errs = errors(page);
    await page.goto('/#for-acme-freight');
    await page.waitForSelector('html.no-stage');
    await expect(page.locator('#stage')).toBeHidden();
    await expect(page.locator('#seqPct')).toHaveText('100%');
    await expect(page.locator('#prepared')).toHaveText('Prepared for Acme Freight');
    await page.fill('#c-people', '10');
    await expect(page.locator('#r-cost')).toHaveText('$300,000');
    expect(errs).toEqual([]);
  });
});

test('falls back cleanly if the Three.js chunk fails to load', async ({ page }) => {
  await page.route(/_astro\/index\.[\w-]+\.js$/, (r) => r.abort());
  await page.goto('/');
  await page.waitForSelector('html.no-stage');
  await expect(page.locator('#stage')).toBeHidden();
  await expect(page.locator('#seqPct')).toHaveText('100%');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('static frame, no animation, steps filled, headings untouched', async ({ page }) => {
    const errs = errors(page);
    await page.goto('/');
    await page.waitForSelector('html.stage-on');
    await expect(page.locator('#seqPct')).toHaveText('100%');
    await expect(page.locator('#steps')).toHaveCSS('--fill', '1');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
    await expect(page.locator('.scanline')).toBeHidden();
    // no scramble: heading text is never replaced by glyphs
    await page.locator('#h-ashes').scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await expect(page.locator('#h-ashes')).toHaveText("Where your team's hours burn.");
    // B/L demo does not animate
    expect(await page.locator('.fld.lit').count()).toBe(0);
    // scrolling re-renders the static frame without errors
    await page.evaluate(() => scrollTo(0, 800));
    await page.waitForTimeout(200);
    expect(errs).toEqual([]);
  });

  test('ignite still shows the name, then returns to the phoenix', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html.stage-on');
    await page.fill('#f-co', 'Miami Cargo');
    await page.click('#igniter button');
    await expect(page.locator('#seqState')).toHaveText('Reborn: MIAMI CARGO');
  });
});
