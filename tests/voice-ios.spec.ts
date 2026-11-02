// iOS / WebKit audit for the phoenix voice (preview-mode build on :4322, WebKit with the iPhone 15 profile; see playwright.config.ts).
import { expect, test, type Page } from '@playwright/test';
import { GREETING, finishGreeting, instrument, plays, ready, talks } from './voice-helpers';

const phoenix = (page: Page) => page.locator('.phx-talk');
const SPEAK = 'Tap the phoenix to speak';
const TALK = 'Tap the phoenix to start talking';

test.describe('iPhone 15 (WebKit)', () => {
  test('the label is visible from load with the touch wording, on a real button, and nothing plays', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await expect(page.locator('.phx-label')).toBeVisible();
    await expect(page.locator('.phx-label')).toHaveText(SPEAK);
    await expect(phoenix(page)).toHaveAttribute('role', 'button');
    await expect(phoenix(page)).toHaveAttribute('aria-label', SPEAK);
    expect(await plays(page)).toEqual([]);
    const r = await page.locator('.phx-row').evaluate((e) => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; });
    expect(r).toBe(true);
  });

  test('Ignite plays nothing (tap, or the keyboard\'s Go) and still does its own job', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await page.fill('#f-co', 'Santos Freight');
    await page.tap('#igniter button[type=submit]');
    await page.tap('#f-co');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    expect(await plays(page)).toEqual([]);
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'idle');
    expect(await page.inputValue('#f-company')).toBe('Santos Freight');
  });

  test('first tap on the phoenix: play() runs inside that tap, after the audio session is set to "playback" (plays through silent mode)', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await phoenix(page).tap();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    const play = (await plays(page))[0];
    expect(play.inGesture, JSON.stringify(play)).toBe(true);
    expect(play.session).toBe('playback');
    await expect(page.locator('.phx-caption')).toHaveText(GREETING);
    await expect(page.locator('.phx-label')).toBeHidden();
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'playing', { timeout: 20_000 });
  });

  test('second tap sends phoenix:talk and does not replay; a tap during the greeting is ignored', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await phoenix(page).tap();
    await phoenix(page).tap(); // during the greeting
    await page.waitForTimeout(400);
    expect(await talks(page)).toEqual([]);
    expect((await plays(page)).length).toBe(1);
    await finishGreeting(page);
    await expect(page.locator('.phx-label')).toHaveText(TALK);
    await phoenix(page).tap();
    expect(await talks(page)).toEqual(['click']);
    expect((await plays(page)).length).toBe(1);
  });

  test('keyboard Enter and Space on the phoenix work', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await phoenix(page).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    expect((await plays(page))[0].inGesture).toBe(true);
    await finishGreeting(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    expect(await talks(page)).toEqual(['key', 'key']);
  });

  test('play() does not depend on preloaded data: preload forced to "none" and a slow first fetch, the tap still starts playback', async ({ page }) => {
    await instrument(page);
    await page.route('**/audio/greeting-en.mp3', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
    await ready(page);
    await page.evaluate(() => { (document.querySelector('audio') as HTMLAudioElement).preload = 'none'; });
    await phoenix(page).tap();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', /playing|idle/);
    await expect(page.locator('.phx-caption')).toBeVisible(); // the caption is up straight away
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'playing', { timeout: 20_000 });
  });

  test('the audio element is created once, early, with its source already set, and is the one that plays', async ({ page }) => {
    await instrument(page);
    await ready(page);
    expect(await page.locator('audio').count()).toBe(1);
    expect(await page.locator('audio').getAttribute('src')).toBe('/audio/greeting-en.mp3');
    await page.evaluate(() => { (document.querySelector('audio') as HTMLAudioElement & { __mark?: string }).__mark = 'first'; });
    await phoenix(page).tap();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    expect(await page.locator('audio').count()).toBe(1);
    expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement & { __mark?: string }).__mark)).toBe('first');
  });

  test('if iOS rejects play(): captions still show, the state says blocked, and the label returns after a reading time', async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('The request is not allowed by the user agent or the platform in the current context', 'NotAllowedError')); });
    await ready(page);
    await phoenix(page).tap();
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'blocked');
    await expect(page.locator('.phx-caption')).toHaveText(GREETING);
    await expect(page.locator('.phx-label')).toBeHidden();
    await page.clock.fastForward(10_000);
    await expect(page.locator('.phx-label')).toHaveText(TALK);
    await expect(page.locator('.phx-caption')).toBeHidden();
  });

  test('muted: captions show and the state reads "blocked"', async ({ page }) => {
    await ready(page);
    await page.locator('.phx-mute').tap();
    await phoenix(page).tap();
    await expect(page.locator('.phx-caption')).toHaveText(GREETING);
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'blocked');
  });

  test('on a WebKit without navigator.audioSession nothing breaks', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await instrument(page, { stubSession: false });
    await page.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'audioSession', { value: undefined, configurable: true }); } catch { /* already absent */ } });
    await ready(page);
    await phoenix(page).tap();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    expect(errors).toEqual([]);
  });

  test('reduced motion: no pulse and no fade', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, baseURL: 'http://localhost:4322' });
    const page = await ctx.newPage();
    await ready(page);
    expect(await page.locator('.phx-glyph').evaluate((e) => getComputedStyle(e, '::after').animationName)).toBe('none');
    await expect(page.locator('.phx-label')).toBeVisible();
    await ctx.close();
  });

  test('normal motion: the ring pulses', async ({ page }) => {
    await ready(page);
    expect(await page.locator('.phx-glyph').evaluate((e) => getComputedStyle(e, '::after').animationName)).toBe('phx-pulse');
  });

  test('?voicedebug=1 on the iPhone profile: trigger and tapCount, audioSession going from auto to playback, inside the screen', async ({ page }) => {
    await instrument(page);
    await ready(page, '/?voicedebug=1');
    const box = page.locator('#voiceDebug');
    await expect(box).toBeVisible();
    await expect(box).toContainText('trigger=none');
    await expect(box).toContainText('tapCount=0');
    await expect(box).toContainText('audioSession=yes type=auto');
    await phoenix(page).tap();
    await expect(box).toContainText('trigger=phoenix');
    await expect(box).toContainText('tapCount=1');
    await expect(box).toContainText('audioSession=yes type=playback');
    const r = await box.evaluate((e) => { const b = e.getBoundingClientRect(); return [b.left, Math.round(b.right) === innerWidth, Math.round(b.bottom) === innerHeight]; });
    expect(r).toEqual([0, true, true]);
  });
});
