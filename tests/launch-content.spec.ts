import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
// @ts-expect-error plain .mjs helper shared with `npm run launch:check`
import { findPlaceholders } from '../scripts/launch-check.mjs';

test.describe('launch content', () => {
  test('process timelines and audit outline promise', async ({ page }) => {
    await page.goto('/');
    const steps = page.locator('#steps .step');
    await expect(steps.nth(1).locator('.time')).toHaveText('Within 3 business days');
    await expect(steps.nth(2).locator('.time')).toHaveText('4 weeks side by side');
    await expect(steps.nth(2).locator('p')).toHaveText(
      'Built around your systems, then run on real shipments next to your team for 4 weeks, measured against your baseline.',
    );
    await expect(page.locator('#audit li', { hasText: 'A written outline' })).toHaveText('A written outline within 3 business days');
  });

  test('design-partner block replaces the case cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.case, .cases')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: "Systems we've built" })).toHaveCount(0);
    const p = page.locator('#partners');
    await expect(p.getByRole('heading', { name: 'Design partners' })).toBeVisible();
    await expect(p.locator('.sub-h .hud')).toHaveText('3 places open');
    await expect(p.locator('.partner-slots li')).toHaveText(['01Open', '02Open', '03Open']);
    await expect(p.locator('.partner-slots')).toHaveAttribute('aria-label', 'Design-partner places');
  });

  test('"Apply as a design partner" pre-fills the form and is submitted', async ({ page }) => {
    let body: Record<string, string> | null = null;
    await page.route('https://formspree.io/f/**', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto('/');
    await page.locator('#partners a.btn-fire').click();
    await expect(page.locator('#formInterest')).toHaveText('Interested in becoming a design partner.');
    await expect(page.locator('#f-workflow')).toHaveValue('Something else');
    await page.fill('#f-name', 'Ana Souza');
    await page.fill('#f-company', 'Santos Freight');
    await page.fill('#f-email', 'ana@example.com');
    await page.click('#auditForm button[type=submit]');
    await expect(page.locator('#formStatus')).toContainText('Request received');
    expect(body).toMatchObject({ workflow: 'Something else', blueprint: 'Design partner', message: 'Interested in becoming a design partner.' });
  });

  test('the form error message carries the contact email', async ({ page }) => {
    await page.route('https://formspree.io/f/**', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.goto('/');
    await page.fill('#f-name', 'A');
    await page.fill('#f-company', 'B');
    await page.fill('#f-email', 'a@b.co');
    await page.click('#auditForm button[type=submit]');
    await expect(page.locator('#formStatus')).toContainText('hello@phoenixworld.ai');
  });

  test('desktop and phone: partner block lays out and does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const d = await page.evaluate(() => {
      const c = document.querySelector('#partners .partner-copy')!.getBoundingClientRect();
      const s = document.querySelector('#partners .partner-slots')!.getBoundingClientRect();
      return { sideBySide: s.left >= c.right - 1 };
    });
    expect(d.sideBySide).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const m = await page.evaluate(() => {
      const c = document.querySelector('#partners .partner-copy')!.getBoundingClientRect();
      const s = document.querySelector('#partners .partner-slots')!.getBoundingClientRect();
      const b = document.querySelector('#partners .btn')!.getBoundingClientRect();
      return { stacked: s.top >= c.bottom && b.top >= s.bottom, overflow: document.documentElement.scrollWidth > innerWidth, fits: s.right <= innerWidth && b.right <= innerWidth };
    });
    expect(m).toEqual({ stacked: true, overflow: false, fits: true });
  });

  test('the built site has zero placeholders', () => {
    for (const f of ['dist/index.html', 'dist/privacy/index.html']) expect(findPlaceholders(readFileSync(f, 'utf8')), f).toEqual([]);
  });
});
