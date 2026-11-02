import { expect, test, type Page } from '@playwright/test';
import { parsePersonalHash, slugToName } from '../src/scripts/hash';
import { scrollSettled } from './scroll';

const visibleCards = (page: Page) => page.locator('.bp:not([hidden])');
const gold = 'rgb(255, 190, 92)';

test.describe('parsePersonalHash (pure)', () => {
  test('plain link is unchanged', () => {
    expect(parsePersonalHash('#for-acme-freight')).toEqual({ slug: 'acme-freight', blueprint: null });
    expect(parsePersonalHash('#for-dhl-global-3pl')).toEqual({ slug: 'dhl-global-3pl', blueprint: null });
  });
  test('valid blueprint 01..10', () => {
    expect(parsePersonalHash('#for-acme-logistics--bp-01')).toEqual({ slug: 'acme-logistics', blueprint: '01' });
    expect(parsePersonalHash('#for-acme--bp-10')).toEqual({ slug: 'acme', blueprint: '10' });
    expect(parsePersonalHash('#for-acme--bp-07')?.blueprint).toBe('07');
  });
  test('invalid blueprint is ignored, company kept', () => {
    for (const bad of ['00', '11', '1', '001', 'ab', '', '1a', '-1'])
      expect(parsePersonalHash(`#for-acme--bp-${bad}`), bad).toEqual({ slug: 'acme', blueprint: null });
  });
  test('missing company or not a personal link: ignored', () => {
    for (const h of ['#for--bp-01', '#for-', '#for', '#audit', '', '#for-ac me', '#for-' + 'a'.repeat(41), '#for-acme--bp-01#x', '#for-Acme--bp-01'])
      expect(parsePersonalHash(h), h).toBeNull();
    expect(parsePersonalHash('#for-' + 'a'.repeat(40))?.slug).toHaveLength(40);
  });
  test('slugToName', () => {
    expect(slugToName('acme-logistics')).toBe('Acme Logistics');
    expect(slugToName('dhl-global-3pl')).toBe('Dhl Global 3pl');
  });
});

test.describe('slug contract: ^[a-z0-9]+(-[a-z0-9]+)*$, max 40, optional --bp-01..10', () => {
  const slug40 = 'abcdefgh-'.repeat(4) + 'abcd'; // 40 chars, hyphenated
  const slug40flat = 'a'.repeat(40);

  test('fixtures are exactly 40 characters', () => {
    expect(slug40).toHaveLength(40);
    expect(slug40flat).toHaveLength(40);
  });

  test('a 40-character slug is accepted, with and without a blueprint suffix', () => {
    for (const slug of [slug40, slug40flat]) {
      expect(parsePersonalHash(`#for-${slug}`)).toEqual({ slug, blueprint: null });
      expect(parsePersonalHash(`#for-${slug}--bp-01`)).toEqual({ slug, blueprint: '01' });
      expect(parsePersonalHash(`#for-${slug}--bp-10`)).toEqual({ slug, blueprint: '10' });
      expect(parsePersonalHash(`#for-${slug}--bp-11`)).toEqual({ slug, blueprint: null }); // invalid NN: ignored, company kept
    }
  });

  test('a 41-character slug is rejected, with and without a suffix', () => {
    const slug41 = slug40flat + 'a';
    expect(parsePersonalHash(`#for-${slug41}`)).toBeNull();
    expect(parsePersonalHash(`#for-${slug41}--bp-01`)).toBeNull();
    expect(parsePersonalHash(`#for-${slug40}-a--bp-01`)).toBeNull(); // 42
  });

  test('accepts exactly the slug pattern', () => {
    for (const ok of ['a', '0', 'acme', 'acme-logistics', 'a-b-c', '3pl-co', 'a1-b2', '9-9'])
      expect(parsePersonalHash(`#for-${ok}`)?.slug, ok).toBe(ok);
  });

  test('rejects everything the pattern rejects', () => {
    for (const bad of [
      'Acme', 'ACME', 'acme-Logistics', // uppercase
      'acme-', '-acme', '-', '--', // leading / trailing hyphen
      'a--b', 'a---b', // doubled hyphen
      'acme_logistics', 'acme.co', 'acme%20co', 'acme+co', 'ac me', 'acmé', // other characters
    ])
      expect(parsePersonalHash(`#for-${bad}`), bad).toBeNull();
    // the same slugs with a valid suffix are rejected too: an invalid company is never rescued by the blueprint
    for (const bad of ['Acme', 'acme-', 'a--b']) expect(parsePersonalHash(`#for-${bad}--bp-01`), bad).toBeNull();
  });

  test('suffix is exactly --bp-01 .. --bp-10', () => {
    for (let n = 1; n <= 10; n++) {
      const nn = String(n).padStart(2, '0');
      expect(parsePersonalHash(`#for-acme--bp-${nn}`)?.blueprint).toBe(nn);
    }
    for (const bad of ['00', '11', '1', '001', '010', 'ab', '', '1-', '-1', '01--bp-02', '01-02'])
      expect(parsePersonalHash(`#for-acme--bp-${bad}`)?.blueprint, bad).toBeNull();
    expect(parsePersonalHash('#for-acme-bp-01')?.slug).toBe('acme-bp-01'); // a single hyphen is part of the slug, not a suffix
    expect(parsePersonalHash('#for-acme-bp-01')?.blueprint).toBeNull();
  });

  test('browser: 40-character slug + blueprint suffix fully round-trips', async ({ page }) => {
    await page.goto(`/#for-${slug40}--bp-04`);
    const name = 'Abcdefgh Abcdefgh Abcdefgh Abcdefgh Abcd'; // 40 characters, nothing truncated
    expect(name).toHaveLength(40);
    await expect(page.locator('#prepared span').first()).toHaveText(`Prepared for ${name}`);
    await expect(page.locator('#prepared .suggest')).toHaveText('Suggested system: Order inbox to ERP');
    await expect(page.locator('#f-company')).toHaveValue(name);
    await expect(page.locator('.bp.suggested .bp-id')).toHaveText('BP-04');
    await expect(page.locator('.chip[data-cat="distribution"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#f-workflow')).toHaveValue('Document intake & data entry');
  });

  test('browser: a 41-character slug with a suffix is ignored entirely', async ({ page }) => {
    await page.goto(`/#for-${slug40flat}a--bp-04`);
    await page.waitForTimeout(400);
    await expect(page.locator('#prepared')).toBeHidden();
    await expect(page.locator('.bp.suggested')).toHaveCount(0);
    await expect(page.locator('.bp:not([hidden])')).toHaveCount(10);
  });

  test('browser: an uppercase slug is ignored entirely', async ({ page }) => {
    await page.goto('/#for-Acme-Freight');
    await page.waitForTimeout(400);
    await expect(page.locator('#prepared')).toBeHidden();
    await expect(page.locator('#f-company')).toHaveValue('');
    await expect(page.locator('.bp:not([hidden])')).toHaveCount(10);
  });
});

test.describe('valid blueprint link', () => {
  test('hero line, filtered library, highlighted card, prefilled form; page does not jump', async ({ page }) => {
    await page.goto('/#for-acme-logistics--bp-01');
    const prepared = page.locator('#prepared');
    await expect(prepared.locator('span').nth(0)).toHaveText('Prepared for Acme Logistics');
    await expect(prepared.locator('span.suggest')).toHaveText('Suggested system: Customs entry copilot');
    await expect(prepared.locator('span.suggest')).toBeVisible();

    await expect(page.locator('.chip[data-cat="logistics"]')).toHaveAttribute('aria-pressed', 'true');
    const card = page.locator('.bp.suggested');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.bp-id')).toHaveText('BP-01');
    await expect(card.locator('.bp-suggest')).toHaveText('Suggested for you');
    await expect(card).toHaveCSS('border-top-color', gold);

    await expect(page.locator('#f-company')).toHaveValue('Acme Logistics');
    await expect(page.locator('#f-workflow')).toHaveValue('Customs prep');
    await expect(page.locator('#formInterest')).toHaveText('Blueprint you picked: Customs entry copilot.');
    await expect(page.locator('#formInterest')).toBeVisible();

    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test('opens on the blueprint’s own industry (BP-07 → professional services, BP-10 → insurance)', async ({ page }) => {
    await page.goto('/#for-santos-cpa--bp-07');
    await expect(page.locator('.chip[data-cat="services"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleCards(page)).toHaveCount(1);
    await expect(page.locator('.bp.suggested h4')).toHaveText('Client intake and document collector');
    await expect(page.locator('#prepared .suggest')).toHaveText('Suggested system: Client intake and document collector');
    await expect(page.locator('#f-workflow')).toHaveValue('Document intake & data entry');

    await page.goto('/#for-harbor-insure--bp-10');
    await page.reload();
    await expect(page.locator('.chip[data-cat="insurance"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.bp.suggested h4')).toHaveText('Certificate and renewal desk');
    await expect(page.locator('#f-workflow')).toHaveValue('Something else');
  });

  test('every blueprint 01–10 resolves to its card', async ({ page }) => {
    for (let n = 1; n <= 10; n++) {
      const nn = String(n).padStart(2, '0');
      await page.goto(`/#for-acme--bp-${nn}`);
      await page.reload();
      await expect(page.locator('.bp.suggested .bp-id')).toHaveText(`BP-${nn}`);
    }
  });

  test('card scrolls to the centre of the screen only when the visitor reaches the Proof chapter', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#for-acme--bp-09'); // hospitality, far from the top of the library
    const card = page.locator('.bp.suggested');
    await expect(card).toHaveCount(1);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => scrollY)).toBe(0); // not on load
    // the visitor scrolls down by hand until Proof comes into view; the page then centres the card with a smooth scroll
    const from = await page.evaluate(() => document.getElementById('proof')!.offsetTop - 300);
    await page.evaluate((top) => scrollTo({ top, behavior: 'instant' as ScrollBehavior }), from);
    await scrollSettled(page, from, { idleMs: 5000 }); // the centring starts once the observer fires, which can lag under load
    // cards now carry a product screen and can be taller than the viewport, so "centred" is the contract (fully inside it when it fits)
    const off = await card.evaluate((el) => { const r = el.getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - innerHeight / 2); });
    expect(off).toBeLessThan(40);
  });

  test('jumping to the audit section from the hero button is not hijacked', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 }); // tall enough that the hero button is fully in view: Playwright would otherwise nudge the page before the click
    await page.goto('/#for-acme--bp-09');
    const from = await page.evaluate(() => scrollY);
    await page.click('main .hero a[href="#audit"]');
    await scrollSettled(page, from, { idleMs: 5000 }); // the smooth scroll can start late when several software-WebGL pages share the CPU
    expect(await page.evaluate(() => Math.abs(document.getElementById('audit')!.getBoundingClientRect().top))).toBeLessThan(200); // still sitting on the audit section
    await expect(page.locator('.bp.suggested')).toHaveCount(1); // highlight survives the hash change
  });

  test('the suggested blueprint is submitted with the form', async ({ page }) => {
    let body: Record<string, string> | null = null;
    await page.route('https://formspree.io/f/**', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto('/#for-acme-logistics--bp-02');
    await page.fill('#f-name', 'Ana Souza');
    await page.fill('#f-email', 'ana@example.com');
    await page.click('#auditForm button[type=submit]');
    await expect(page.locator('#formStatus')).toContainText('Request received');
    expect(body).toMatchObject({ company: 'Acme Logistics', blueprint: 'Rate quote engine', workflow: 'Quotes from email' });
  });

  test('"Build this for us" still overrides the suggestion', async ({ page }) => {
    await page.goto('/#for-acme--bp-01');
    await page.locator('.bp .btn', { hasText: 'Build this for us' }).nth(1).click();
    await expect(page.locator('#formInterest')).toHaveText('Blueprint you picked: Rate quote engine.');
    await expect(page.locator('#f-workflow')).toHaveValue('Quotes from email');
  });

  test('switching to another personal link replaces the suggestion', async ({ page }) => {
    await page.goto('/#for-acme--bp-01');
    await expect(page.locator('.bp.suggested .bp-id')).toHaveText('BP-01');
    await page.evaluate(() => { location.hash = '#for-zeta-corp'; });
    await expect(page.locator('.bp.suggested')).toHaveCount(0);
    await expect(page.locator('.bp-suggest')).toHaveCount(0);
    await expect(page.locator('#prepared')).toHaveText('Prepared for Zeta Corp');
    await expect(page.locator('#formInterest')).toBeHidden();
  });
});

test.describe('invalid blueprint number', () => {
  for (const bad of ['00', '11', '1', 'ab', '100']) {
    test(`--bp-${bad}: behaves as the plain link`, async ({ page }) => {
      await page.goto(`/#for-acme-freight--bp-${bad}`);
      await expect(page.locator('#prepared')).toHaveText('Prepared for Acme Freight');
      await expect(page.locator('#prepared span')).toHaveCount(0);
      await expect(page.locator('.bp.suggested')).toHaveCount(0);
      await expect(page.locator('.bp-suggest')).toHaveCount(0);
      await expect(page.locator('.chip[data-cat="logistics"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(visibleCards(page)).toHaveCount(3);
      await expect(page.locator('#f-company')).toHaveValue('Acme Freight');
      await expect(page.locator('#formInterest')).toBeHidden();
    });
  }
});

test.describe('missing company', () => {
  test('#for--bp-01 is ignored entirely', async ({ page }) => {
    await page.goto('/#for--bp-01');
    await page.waitForTimeout(500);
    await expect(page.locator('#prepared')).toBeHidden();
    await expect(page.locator('.bp.suggested')).toHaveCount(0);
    await expect(visibleCards(page)).toHaveCount(10);
    await expect(page.locator('#f-company')).toHaveValue('');
    await expect(page.locator('#formInterest')).toBeHidden();
  });
});

test.describe('plain #for- link is unchanged', () => {
  test('same result as before: one line, logistics filter, no pick', async ({ page }) => {
    await page.goto('/#for-acme-freight');
    await expect(page.locator('#prepared')).toHaveText('Prepared for Acme Freight');
    await expect(page.locator('#prepared span')).toHaveCount(0);
    await expect(page.locator('.chip[data-cat="logistics"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleCards(page)).toHaveCount(3);
    await expect(page.locator('.bp.suggested')).toHaveCount(0);
    await expect(page.locator('#f-company')).toHaveValue('Acme Freight');
    await expect(page.locator('#f-workflow')).toHaveValue('Document intake & data entry'); // untouched default
    await expect(page.locator('#formInterest')).toBeHidden();
  });
});

test.describe('the lazily loaded stage never yanks the page', () => {
  const delayStage = (page: Page) =>
    page.route(/_astro\/index\.[\w-]+\.js$/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });

  for (const link of ['#for-acme-freight', '#for-acme-logistics--bp-01']) {
    test(`${link}: visitor scrolls before the stage is ready`, async ({ page }) => {
      await delayStage(page);
      await page.goto('/' + link);
      await page.evaluate(() => scrollTo({ top: 3000, behavior: 'instant' as ScrollBehavior }));
      await page.waitForSelector('html.stage-on', { timeout: 15000 });
      await expect(page.locator('#seqState')).toHaveText(/Reborn: ACME/, { timeout: 10000 });
      await page.waitForTimeout(1500);
      expect(Math.abs((await page.evaluate(() => scrollY)) - 3000)).toBeLessThan(5);
    });
  }

  test('the visitor’s own Ignite press still brings the hero back', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html.stage-on');
    await page.fill('#f-co', 'Miami Cargo');
    await page.evaluate(() => scrollTo({ top: 3000, behavior: 'instant' as ScrollBehavior }));
    await page.evaluate(() => (document.getElementById('igniter') as HTMLFormElement).requestSubmit());
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 8000 }).toBeLessThan(5);
  });
});
