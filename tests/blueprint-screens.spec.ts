import { expect, test } from '@playwright/test';

test.describe('blueprint product screens', () => {
  test('every blueprint card has an accessible sample screen and a "Connects to" row', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.bp');
    await expect(cards).toHaveCount(10);
    for (let i = 0; i < 10; i++) {
      const card = cards.nth(i);
      const screen = card.locator('.screen');
      await expect(screen, `card ${i + 1}`).toHaveCount(1);
      await expect(screen).toHaveAttribute('role', 'img');
      await expect(screen).toHaveAttribute('aria-label', /^Illustrative screen of the .+, with sample data$/);
      await expect(screen.locator('.scr-app')).toHaveText(/^PHX · .+/);
      await expect(screen.locator('.scr-live')).toHaveText('Live');
      await expect(screen.locator('.scr-row .st').first()).toBeVisible();
      await expect(screen.locator('.scr-act .note')).toHaveText('Sample data · you approve');
      await expect(card.locator('.connects small')).toHaveText('Connects to');
      expect(await card.locator('.connects span').count()).toBeGreaterThanOrEqual(2);
    }
    // screen sits between the card header and its title; connects follows the flow list
    expect(await cards.first().evaluate((el) => [...el.children].map((c) => c.className.split(' ')[0] || c.tagName.toLowerCase()).slice(0, 4))).toEqual(['bp-top', 'screen', 'h4', 'today']);
    // the one bar chart lives in BP-08
    await expect(page.locator('.scr-bars')).toHaveCount(1);
    await expect(page.locator('.bp', { has: page.locator('.bp-id', { hasText: 'BP-08' }) }).locator('.scr-bars')).toHaveCount(1);
  });

  test('status chips use the four colours (ok / warn / info / mute) from the design tokens', async ({ page }) => {
    await page.goto('/');
    const colours = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const k of ['ok', 'warn', 'info', 'mute']) { const e = document.querySelector('.st.' + k); if (e) out[k] = getComputedStyle(e).color; }
      return out;
    });
    expect(Object.keys(colours).sort()).toEqual(['info', 'mute', 'ok', 'warn']);
    expect(new Set(Object.values(colours)).size).toBe(4);
  });

  test('the Live dot pulses, and stops under reduced motion', async ({ page, browser }) => {
    await page.goto('/');
    expect(await page.locator('.scr-live i').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('live');
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const rm = await ctx.newPage();
    await rm.goto(new URL(page.url()).origin + '/');
    expect(await rm.locator('.scr-live i').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    await ctx.close();
  });

  test('no horizontal overflow at phone width with the screens in place', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const el of await page.locator('.screen').all()) {
      expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
  });

  for (const [label, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]] as const) {
    for (const link of ['/#for-acme--bp-09', '/#bp-09', '/#for-acme--bp-03']) {
      test(`deep link ${link} lands centred on ${label} (taller cards)`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: vp }); // fresh page: a same-document hash change would not re-run the page script
        const page = await ctx.newPage();
        await page.goto(link);
        const card = page.locator('.bp.suggested');
        await expect(card).toHaveCount(1);
        await page.waitForTimeout(600);
        expect(await page.evaluate(() => scrollY)).toBe(0); // never moves on load
        await page.evaluate(() => scrollTo({ top: document.getElementById('proof')!.offsetTop - 300, behavior: 'instant' as ScrollBehavior }));
        await expect
          .poll(() => card.evaluate((el) => { const r = el.getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - innerHeight / 2); }), { timeout: 8000 })
          .toBeLessThan(40);
        await ctx.close();
      });
    }
  }
});
