import { expect, test } from '@playwright/test';

const fill = async (page: import('@playwright/test').Page) => {
  await page.fill('#f-name', 'Ana Souza');
  await page.fill('#f-company', 'Santos Freight');
  await page.fill('#f-email', 'ana@example.com');
};

test('validation messages are kept', async ({ page }) => {
  await page.goto('/');
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toHaveText('Add your name, company, email to request the audit.');
  await fill(page);
  await page.fill('#f-email', 'nope');
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toContainText('Check the email address');
});

test('submits blueprint, calculator estimate and workflow to Formspree, then confirms', async ({ page }) => {
  let body: Record<string, string> | null = null;
  await page.route('https://formspree.io/f/**', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/');
  await page.fill('#c-people', '10');
  await page.fill('#c-rate', '50');
  await page.locator('.bp .btn', { hasText: 'Build this for us' }).first().click();
  await fill(page);
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toContainText('Request received, Ana Souza');
  await expect(page.locator('#formStatus')).not.toContainText('Prototype');
  expect(body).toMatchObject({
    name: 'Ana Souza',
    company: 'Santos Freight',
    email: 'ana@example.com',
    workflow: 'Customs prep',
    blueprint: 'Customs entry copilot',
    calculator_estimate: '$500,000 a year (10,000 hours) on manual work',
    calculator_inputs: '10 people, $50/h, 20 h/week each, 50% estimated automatable',
    _gotcha: '',
  });
  // pick is cleared after a successful send
  await expect(page.locator('#formInterest')).toBeHidden();
});

test('shows an error and keeps the data when Formspree fails', async ({ page }) => {
  await page.route('https://formspree.io/f/**', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/');
  await fill(page);
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toContainText("That didn't send");
  await expect(page.locator('#f-name')).toHaveValue('Ana Souza');
  await expect(page.locator('#auditForm button[type=submit]')).toBeEnabled();
});

const captureBody = async (page: import('@playwright/test').Page) => {
  const holder: { body: Record<string, string> | null } = { body: null };
  await page.route('https://formspree.io/f/**', async (route) => {
    holder.body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  return holder;
};

test('calculator data is only sent when the visitor changed an input', async ({ page }) => {
  const sent = await captureBody(page);
  await page.goto('/');
  await fill(page);
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toContainText('Request received');
  expect(sent.body!.calculator_estimate).toBe('Not used');
  expect(sent.body).not.toHaveProperty('calculator_inputs');
  expect(JSON.stringify(sent.body)).not.toContain('120,000');

  // touching any one input (here the slider) counts as using it
  await page.locator('#c-share').evaluate((el: HTMLInputElement) => {
    el.value = '70';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await fill(page);
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toContainText('Request received');
  expect(sent.body!.calculator_estimate).toContain('a year');
  expect(sent.body!.calculator_inputs).toContain('70% estimated automatable');
});

test('optional message: labelled, capped at 1,000 characters, sent as message with the blueprint note', async ({ page }) => {
  const sent = await captureBody(page);
  await page.goto('/');
  const box = page.getByLabel("Anything you'd like me to know? (optional)");
  await expect(box).toHaveAttribute('maxlength', '1000');
  await expect(box).not.toHaveAttribute('required', '');
  await fill(page);
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toContainText('Request received');
  expect(sent.body!.message).toBe('');

  await fill(page);
  await box.fill('x'.repeat(1200));
  expect(await box.inputValue()).toHaveLength(1000);
  await box.fill('We ship 40 containers a week.');
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toContainText('Request received');
  expect(sent.body!.message).toBe('We ship 40 containers a week.');
  await expect(box).toHaveValue('');

  await page.locator('.bp .btn', { hasText: 'Build this for us' }).first().click();
  await fill(page);
  await box.fill('Hello');
  await page.click('#auditForm button[type=submit]');
  await expect(page.locator('#formStatus')).toContainText('Request received');
  expect(sent.body!.message).toMatch(/^.+\n\nHello$/s);
});

test('message box matches the other fields', async ({ page }) => {
  await page.goto('/');
  const [a, b] = await Promise.all(
    ['#f-company', '#f-message'].map((s) =>
      page.locator(s).evaluate((e) => {
        const c = getComputedStyle(e);
        return [c.fontSize, c.color, c.backgroundColor, c.borderTopColor, c.borderTopWidth, c.paddingLeft, c.borderRadius];
      }),
    ),
  );
  expect(b).toEqual(a);
});

test('the amber calculator line stays hidden until an input changes, then shows the estimate', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#formEstimate')).toBeHidden();
  await page.fill('#c-people', '10');
  await page.fill('#c-rate', '50');
  await expect(page.locator('#formEstimate')).toBeVisible();
  await expect(page.locator('#formEstimate')).toContainText('$500,000 a year (10,000 hours) on manual work');
});
