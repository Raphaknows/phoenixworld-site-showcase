import { expect, test } from '@playwright/test';

// The flow list's "System" label must not pick up the .sys system-card styles (box, gradient, hover lift).
test('flow list labels are plain text: no box, background or card positioning', async ({ page }) => {
  await page.goto('/');
  const dts = page.locator('.flow dt');
  expect(await dts.count()).toBeGreaterThan(0);
  const styles = await dts.evaluateAll((els) =>
    els.map((e) => {
      const s = getComputedStyle(e);
      return { text: e.textContent, border: s.borderTopWidth, bg: s.backgroundImage, pos: s.position };
    }),
  );
  for (const s of styles) {
    expect(s.border, `${s.text} border`).toBe('0px');
    expect(s.bg, `${s.text} background`).toBe('none');
    expect(s.pos, `${s.text} position`).toBe('static');
  }
  // and the System label keeps its plasma colour
  const sys = page.locator('.flow dt', { hasText: 'System' }).first();
  expect(await sys.evaluate((e) => getComputedStyle(e).color)).not.toBe(await page.locator('.flow dt.in').first().evaluate((e) => getComputedStyle(e).color));
});
