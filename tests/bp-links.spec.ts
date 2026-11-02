import { expect, test, type Page } from '@playwright/test';
import { parseBlueprintHash, parsePersonalHash } from '../src/scripts/hash';
import { scrollSettled } from './scroll';

const visibleCards = (page: Page) => page.locator('.bp:not([hidden])');
const gold = 'rgb(255, 190, 92)';

test.describe('parseBlueprintHash (pure)', () => {
  test('01..10 only', () => {
    for (let n = 1; n <= 10; n++) {
      const nn = String(n).padStart(2, '0');
      expect(parseBlueprintHash(`#bp-${nn}`)).toBe(nn);
    }
    for (const bad of ['#bp-00', '#bp-11', '#bp-1', '#bp-001', '#bp-ab', '#bp-', '#bp', '#bp-01x', '#BP-01', '#bp-01--x', '#for-acme--bp-01', ''])
      expect(parseBlueprintHash(bad), bad).toBeNull();
  });
  test('#for--bp-01 stays ignored by the personal-link parser', () => {
    expect(parsePersonalHash('#for--bp-01')).toBeNull();
  });
});

test.describe('#bp-<NN> (blueprint only)', () => {
  test('opens the library on the industry, highlights the card, prefills blueprint + workflow; no company stuff', async ({ page }) => {
    await page.goto('/#bp-01');
    await expect(page.locator('.chip[data-cat="logistics"]')).toHaveAttribute('aria-pressed', 'true');
    const card = page.locator('.bp.suggested');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.bp-id')).toHaveText('BP-01');
    await expect(card.locator('.bp-suggest')).toHaveText('Suggested for you');
    await expect(card).toHaveCSS('border-top-color', gold);
    await expect(page.locator('#formInterest')).toHaveText('Blueprint you picked: Customs entry copilot.');
    await expect(page.locator('#formInterest')).toBeVisible();
    await expect(page.locator('#f-workflow')).toHaveValue('Customs prep');

    // no "Prepared for" line, no company anywhere
    await expect(page.locator('#prepared')).toBeHidden();
    await expect(page.locator('#prepared')).toHaveText('');
    await expect(page.locator('#f-co')).toHaveValue('');
    await expect(page.locator('#f-company')).toHaveValue('');
  });

  test('no company-name phoenix: the stage never spells a name', async ({ page }) => {
    await page.goto('/#bp-02');
    await page.waitForSelector('html.stage-on');
    await expect(page.locator('#seqPct')).toHaveText('100%', { timeout: 10000 });
    await page.waitForTimeout(1500);
    await expect(page.locator('#seqState')).not.toContainText('Reborn');
  });

  test('industry filter follows the blueprint (BP-05 real estate, BP-08 hospitality)', async ({ page }) => {
    await page.goto('/#bp-05');
    await expect(page.locator('.chip[data-cat="realestate"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleCards(page)).toHaveCount(1);
    await expect(page.locator('.bp.suggested h4')).toHaveText('Maintenance request triage');
    await expect(page.locator('#f-workflow')).toHaveValue('Something else');

    await page.goto('/#bp-08');
    await page.reload();
    await expect(page.locator('.chip[data-cat="hospitality"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(visibleCards(page)).toHaveCount(2);
    await expect(page.locator('.bp.suggested h4')).toHaveText('Guest message and review hub');
  });

  test('every number 01–10 resolves to its card, workflow matches the button', async ({ page }) => {
    for (let n = 1; n <= 10; n++) {
      const nn = String(n).padStart(2, '0');
      await page.goto(`/#bp-${nn}`);
      await page.reload();
      const card = page.locator('.bp.suggested');
      await expect(card.locator('.bp-id')).toHaveText(`BP-${nn}`);
      await expect(page.locator('#f-workflow')).toHaveValue((await card.locator('[data-bp]').getAttribute('data-wf'))!);
    }
  });

  test('same scroll timing: not on load, only when the visitor reaches Proof', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#bp-09');
    const card = page.locator('.bp.suggested');
    await expect(card).toHaveCount(1);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.evaluate(() => scrollTo({ top: document.getElementById('proof')!.offsetTop - 300, behavior: 'instant' as ScrollBehavior }));
    await expect
      // cards carry a product screen now and can be taller than the viewport: centred is the contract
      .poll(() => card.evaluate((el) => { const r = el.getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - innerHeight / 2) < 40; }), { timeout: 5000 })
      .toBe(true);
  });

  test('in-page jumps to the audit section are not hijacked', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 }); // tall enough that the hero button is fully in view: Playwright would otherwise nudge the page before the click
    await page.goto('/#bp-09');
    const from = await page.evaluate(() => scrollY);
    await page.click('main .hero a[href="#audit"]');
    await scrollSettled(page, from);
    expect(await page.evaluate(() => Math.abs(document.getElementById('audit')!.getBoundingClientRect().top))).toBeLessThan(200);
    await expect(page.locator('.bp.suggested')).toHaveCount(1);
  });

  test('the blueprint is submitted with the form (company typed by the visitor)', async ({ page }) => {
    let body: Record<string, string> | null = null;
    await page.route('https://formspree.io/f/**', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto('/#bp-02');
    await page.fill('#f-name', 'Ana Souza');
    await page.fill('#f-company', 'Santos Freight');
    await page.fill('#f-email', 'ana@example.com');
    await page.click('#auditForm button[type=submit]');
    await expect(page.locator('#formStatus')).toContainText('Request received');
    expect(body).toMatchObject({ company: 'Santos Freight', blueprint: 'Rate quote engine', workflow: 'Quotes from email' });
  });

  test('"Build this for us" overrides it; a later #bp link replaces the highlight', async ({ page }) => {
    await page.goto('/#bp-01');
    await page.locator('.bp .btn', { hasText: 'Build this for us' }).nth(1).click();
    await expect(page.locator('#formInterest')).toHaveText('Blueprint you picked: Rate quote engine.');
    await page.evaluate(() => { location.hash = '#bp-04'; });
    await expect(page.locator('.bp.suggested .bp-id')).toHaveCount(1);
    await expect(page.locator('.bp.suggested .bp-id')).toHaveText('BP-04');
    await expect(page.locator('.chip[data-cat="distribution"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#f-workflow')).toHaveValue('Document intake & data entry');
  });

  test('after a personal bp link, a #bp link updates the hero suggestion line instead of leaving it stale', async ({ page }) => {
    await page.goto('/#for-acme-logistics--bp-01');
    await expect(page.locator('#prepared .suggest')).toHaveText('Suggested system: Customs entry copilot');
    await page.evaluate(() => { location.hash = '#bp-03'; });
    await expect(page.locator('#prepared .suggest')).toHaveText('Suggested system: Shipment exception radar');
    await expect(page.locator('.bp.suggested .bp-id')).toHaveText('BP-03');
    await expect(page.locator('#prepared span').first()).toHaveText('Prepared for Acme Logistics');
  });
});

test.describe('#bp-<NN> invalid numbers are ignored', () => {
  for (const bad of ['00', '11', '1', '001', 'ab', '']) {
    test(`#bp-${bad || '(empty)'}: page untouched`, async ({ page }) => {
      await page.goto(`/#bp-${bad}`);
      await page.waitForTimeout(400);
      await expect(page.locator('.bp.suggested')).toHaveCount(0);
      await expect(page.locator('.bp-suggest')).toHaveCount(0);
      await expect(visibleCards(page)).toHaveCount(10);
      await expect(page.locator('.chip[data-cat="all"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#prepared')).toBeHidden();
      await expect(page.locator('#formInterest')).toBeHidden();
      await expect(page.locator('#f-workflow')).toHaveValue('Document intake & data entry');
    });
  }

  test('#for--bp-01 (no company) is still ignored entirely', async ({ page }) => {
    await page.goto('/#for--bp-01');
    await page.waitForTimeout(400);
    await expect(page.locator('.bp.suggested')).toHaveCount(0);
    await expect(visibleCards(page)).toHaveCount(10);
    await expect(page.locator('#prepared')).toBeHidden();
  });
});
