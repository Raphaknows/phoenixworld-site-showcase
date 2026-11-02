import { expect, test } from '@playwright/test';

test('build stamp: <meta name="build"> and /version.txt agree, and nothing is visible on the page', async ({ page, request }) => {
  await page.goto('/');
  const meta = await page.locator('meta[name="build"]').getAttribute('content');
  expect(meta).toMatch(/^([0-9a-f]{40}|dev)$/);
  const res = await request.get('/version.txt');
  expect(res.status()).toBe(200);
  expect((await res.text()).trim()).toBe(meta);
  expect(await page.locator('body').innerText()).not.toContain(meta!);
});

test('_headers: /version.txt is never cached, and the immutable rule stays scoped to /_astro/*', async () => {
  const fs = await import('node:fs');
  const h = fs.readFileSync('public/_headers', 'utf8');
  expect(h).toMatch(/^\/version\.txt\n {2}Cache-Control: no-store$/m);
  expect(h).toMatch(/^\/_astro\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
  expect((h.match(/immutable/g) ?? []).length).toBe(1);
});
