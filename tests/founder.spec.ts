import { expect, test } from '@playwright/test';

test.describe('founder section', () => {
  test('solo founder: heading, copy, facts, CTA to the audit form, toolbox', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.crew, .member, .portrait')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: "Who you'll work with" })).toBeVisible();
    const f = page.locator('#founder');
    await expect(f.locator('.founder-id b')).toHaveText('Rapha');
    await expect(f.locator('.founder-copy p')).toHaveCount(2);
    await expect(f.locator('.founder-facts li')).toHaveCount(3);
    const cta = f.locator('a.btn-fire');
    await expect(cta).toHaveText('Book your audit with me');
    await expect(cta).toHaveAttribute('href', '#audit');
    await expect(f.locator('.tool-group')).toHaveCount(4);
    await expect(f.locator('.tool-group > span')).toHaveText(['AI', 'Code', 'Automation', 'Ship']);
    await expect(f.locator('.tool-group li')).toHaveText([
      'Claude (Anthropic API)', 'Claude Code', 'Python', 'Node.js', 'TypeScript', 'Playwright', 'Apify', 'GitHub', 'Cloudflare',
    ]);
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toContain('trading');
  });

  test('desktop: copy beside toolbox (1.3fr / 1fr); phone (390px): stacked, no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const d = await page.evaluate(() => {
      const c = document.querySelector('#founder .founder-copy')!.getBoundingClientRect();
      const t = document.querySelector('#founder .toolbox')!.getBoundingClientRect();
      return { sameRow: Math.abs(c.top - t.top) < 4, toolboxRight: t.left >= c.right, wider: c.width > t.width };
    });
    expect(d).toEqual({ sameRow: true, toolboxRight: true, wider: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const m = await page.evaluate(() => {
      const c = document.querySelector('#founder .founder-copy')!.getBoundingClientRect();
      const t = document.querySelector('#founder .toolbox')!.getBoundingClientRect();
      return { stacked: t.top >= c.bottom, overflow: document.documentElement.scrollWidth > innerWidth, toolboxFits: t.right <= innerWidth };
    });
    expect(m).toEqual({ stacked: true, overflow: false, toolboxFits: true });
  });

  test('languages are filled in', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#founder .founder-facts li').nth(1)).toHaveText('English · Español · Português');
  });
});

test.describe('no insurance claims', () => {
  test('the only "insurance" left is the industry filter and BP-10', async ({ page }) => {
    for (const path of ['/', '/privacy/']) {
      await page.goto(path);
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('body *')].flatMap((e) =>
          [...e.childNodes].filter((n) => n.nodeType === 3 && /insurance/i.test(n.textContent ?? '')).map(() => e.className || e.tagName),
        ),
      );
      if (path === '/privacy/') expect(hits).toEqual([]);
      else expect(hits.sort()).toEqual(['bp-ind', 'chip']);
    }
    await page.goto('/');
    const attrs = await page.evaluate(() => [...document.querySelectorAll('*')].flatMap((e) => [...e.attributes].filter((a) => /insurance|E&O/i.test(a.value) && a.name !== 'data-cat').map((a) => a.name)));
    expect(attrs).toEqual([]);
  });

  test('security pack wording', async ({ page }) => {
    await page.goto('/');
    const pack = page.locator('.pack');
    await expect(pack.locator('p')).toHaveText('Ask for my security pack before you share a single document.');
    await expect(pack.locator('li')).toHaveText(['Mutual NDA', 'Data processing agreement', 'Security questionnaire', 'AI provider list']);
    expect(await pack.locator('a').getAttribute('data-note')).toContain('security questionnaire answers');
  });
});
