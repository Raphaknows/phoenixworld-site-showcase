import { expect, test } from '@playwright/test';

// WCAG 2.5.3: a link's accessible name must contain its visible label.
for (const path of ['/', '/privacy/']) {
  test(`logo links on ${path} have an accessible name containing their visible label`, async ({ page }) => {
    await page.goto(path);
    const logos = page.locator('a.logo');
    expect(await logos.count()).toBe(2);
    for (const logo of await logos.all()) {
      const label = ((await logo.locator('b').textContent()) ?? '').trim().toLowerCase();
      const name = ((await logo.getAttribute('aria-label')) ?? '').toLowerCase();
      expect(label).toBe('phoenix world');
      expect(name).toContain(label);
    }
  });
}
