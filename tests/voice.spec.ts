import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { GREETING, finishGreeting, instrument, plays, ready, talks } from './voice-helpers';

const MP3 = path.join(process.cwd(), 'public/audio/greeting-en.mp3');
const phoenix = (page: Page) => page.locator('.phx-talk');
const SPEAK = 'Click the phoenix to speak';
const TALK = 'Click the phoenix to start talking';

test.describe('greeting file (a placeholder clip in this copy)', () => {
  test('an mp3 under 200 KB, mono, a few seconds long, and the only audio file', () => {
    const buf = fs.readFileSync(MP3);
    expect(buf.length).toBeLessThan(200 * 1024);
    expect(buf.length).toBeGreaterThan(5_000);
    expect(buf.subarray(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)).toBe(true);
    expect(fs.readdirSync(path.join(process.cwd(), 'public/audio'))).toEqual(['greeting-en.mp3']); // English only for now
  });
});

test.describe('flag OFF (production build): nothing renders or loads', () => {
  test('no audio element, no label, no mute button, no phoenix button; nothing requested, even after Ignite or a click where the phoenix is', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => /\/audio\/|greeting/.test(r.url()) && hits.push(r.url()));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.waitForSelector('html.stage-on');
    await page.fill('#f-co', 'Santos Freight');
    await page.click('#igniter button[type=submit]');
    await page.mouse.click(950, 400);
    await page.waitForTimeout(1200);
    await expect(page.locator('audio')).toHaveCount(0);
    await expect(page.locator('.phx-voice, .phx-label, .phx-mute, .phx-talk, .phx-caption')).toHaveCount(0);
    await expect(page.locator('[aria-label*="phoenix to" i]')).toHaveCount(0);
    expect(hits).toEqual([]);
    expect(await page.evaluate(() => [sessionStorage.length, localStorage.length])).toEqual([0, 0]);
  });

  test('?voicedebug=1 does nothing in a production build', async ({ page }) => {
    await page.goto('/?voicedebug=1');
    await page.waitForSelector('html.stage-on');
    await page.waitForTimeout(500);
    await expect(page.locator('#voiceDebug, audio')).toHaveCount(0);
  });

  test('the built production site holds zero voice code, CSS, audio reference or label text', () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const text = walk(path.join(process.cwd(), 'dist')).filter((f) => /\.(html|js|css)$/.test(f));
    expect(text.length).toBeGreaterThan(5);
    for (const f of text) {
      const body = fs.readFileSync(f, 'utf8');
      expect(body, f).not.toMatch(/phx-voice|phx-talk|phx-label|phx-caption|phx-mute|greeting-en|phoenix:talk|voicedebug|voice-debug|the phoenix to (speak|start talking)/i);
    }
    expect(fs.readdirSync(path.join(process.cwd(), 'dist/_astro')).filter((f) => /voice/i.test(f))).toEqual([]);
  });
});

test.describe('flag ON (preview build)', () => {
  test.use({ baseURL: 'http://localhost:4322', viewport: { width: 1280, height: 900 } });

  test('the label is there from page load: a real button on the phoenix, labelled, with nothing playing', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await expect(page.locator('.phx-label')).toBeVisible();
    await expect(page.locator('.phx-label')).toHaveText(SPEAK);
    await expect(page.locator('.phx-label .phx-glyph svg')).toBeVisible();
    await expect(phoenix(page)).toHaveAttribute('role', 'button');
    await expect(phoenix(page)).toHaveAttribute('tabindex', '0');
    await expect(phoenix(page)).toHaveAttribute('aria-label', SPEAK);
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('.phx-caption')).toBeHidden();
    expect(await page.evaluate(() => { const a = document.querySelector('audio')!; return [a.paused, a.currentTime, a.getAttribute('src')]; })).toEqual([true, 0, '/audio/greeting-en.mp3']);
    expect(await plays(page)).toEqual([]);
  });

  test('first-time visitor: nothing stored, UNMUTED at full volume', async ({ page }) => {
    await ready(page);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    await expect(page.locator('.phx-mute')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => { const a = document.querySelector('audio')!; return [a.muted, a.volume]; })).toEqual([false, 1]);
  });

  test('Ignite plays nothing and keeps doing its own job', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await page.waitForSelector('html.stage-on');
    await page.fill('#f-co', 'Santos Freight');
    await page.click('#igniter button[type=submit]');
    await page.fill('#f-co', 'Acme');
    await page.press('#f-co', 'Enter');
    await page.waitForTimeout(1200);
    expect(await plays(page)).toEqual([]);
    expect(await page.evaluate(() => { const a = document.querySelector('audio')!; return [a.paused, a.currentTime]; })).toEqual([true, 0]);
    await expect(page.locator('.phx-caption')).toBeHidden();
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'idle');
    await expect(page.locator('.phx-label')).toHaveText(SPEAK);
    expect(await page.inputValue('#f-company')).toBe('Santos Freight'); // Ignite's own effect (company prefill) is intact
  });

  test('first tap on the phoenix plays the greeting: play() runs inside the tap, audio session "playback", captions on, label hidden meanwhile', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await phoenix(page).click();
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    const play = (await plays(page))[0];
    expect(play).toMatchObject({ inGesture: true, gesture: 'click', active: true, session: 'playback', muted: false, volume: 1 });
    await expect(page.locator('.phx-caption')).toHaveText(GREETING);
    await expect(page.locator('.phx-caption')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('.phx-label')).toBeHidden(); // hidden while the greeting plays
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-phase', 'greeting');
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'playing', { timeout: 15_000 });
    expect(await talks(page)).toEqual([]); // the greeting is not a phoenix:talk
  });

  test('when the greeting ends the label returns as "start talking" (and so does the aria-label)', async ({ page }) => {
    await ready(page);
    await phoenix(page).click();
    await expect(page.locator('.phx-caption')).toBeVisible();
    await finishGreeting(page);
    await expect(page.locator('.phx-caption')).toBeHidden();
    await expect(page.locator('.phx-label')).toBeVisible();
    await expect(page.locator('.phx-label')).toHaveText(TALK);
    await expect(phoenix(page)).toHaveAttribute('aria-label', TALK);
  });

  test('a later tap dispatches phoenix:talk and nothing else: no replay, no popup, no scroll', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await phoenix(page).click();
    await finishGreeting(page);
    const before = await page.evaluate(() => [scrollY, location.href, document.body.innerText.length]);
    await phoenix(page).click();
    await phoenix(page).click();
    expect(await talks(page)).toEqual(['click', 'click']);
    expect((await plays(page)).length).toBe(1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => [scrollY, location.href, document.body.innerText.length])).toEqual(before);
    await expect(page.locator('[role=dialog], dialog, [aria-modal=true]')).toHaveCount(0);
    await expect(page.locator('.phx-caption')).toBeHidden();
  });

  test('a tap during the greeting is ignored: no second play, no phoenix:talk', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await phoenix(page).click();
    await phoenix(page).click();
    await phoenix(page).click();
    await page.waitForTimeout(400);
    expect((await plays(page)).length).toBe(1);
    expect(await talks(page)).toEqual([]);
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-phase', 'greeting');
  });

  test('keyboard: Enter starts the greeting (inside the keydown), then Enter and Space send phoenix:talk', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await phoenix(page).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    expect((await plays(page))[0]).toMatchObject({ inGesture: true, gesture: 'keydown', session: 'playback' });
    await page.keyboard.press('Enter'); // during the greeting: ignored
    expect(await talks(page)).toEqual([]);
    await finishGreeting(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    expect(await talks(page)).toEqual(['key', 'key']);
    expect((await plays(page)).length).toBe(1);
  });

  test('keyboard: Space can start the greeting too, and does not scroll the page', async ({ page }) => {
    await instrument(page);
    await ready(page);
    await phoenix(page).focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await plays(page)).length).toBe(1);
    expect((await plays(page))[0].gesture).toBe('keydown');
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test('once per tab session, marked only when sound has started; a reload then shows "start talking" straight away and a tap only sends phoenix:talk', async ({ page }) => {
    await instrument(page);
    await ready(page);
    expect(await page.evaluate(() => sessionStorage.getItem('phx-voice-greeted'))).toBeNull();
    await phoenix(page).click();
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'playing', { timeout: 15_000 });
    expect(await page.evaluate(() => sessionStorage.getItem('phx-voice-greeted'))).toBe('1');
    await page.reload();
    await page.waitForSelector('.phx-voice audio', { state: 'attached' });
    await expect(page.locator('.phx-label')).toBeVisible();
    await expect(page.locator('.phx-label')).toHaveText(TALK);
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-phase', 'talk');
    await phoenix(page).click();
    expect(await talks(page)).toEqual(['click']);
    expect((await plays(page)).length).toBe(0);
    await expect(page.locator('.phx-caption')).toBeHidden();
  });

  test('muted: captions still show, the state reads "blocked", nothing is marked greeted, the label returns', async ({ page }) => {
    await ready(page);
    await page.locator('.phx-mute').click();
    await phoenix(page).click();
    await expect(page.locator('.phx-caption')).toHaveText(GREETING);
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'blocked');
    await page.waitForTimeout(800);
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'blocked'); // the silent playback does not flip it to "playing"
    expect(await page.evaluate(() => document.querySelector('audio')!.muted)).toBe(true);
    expect(await page.evaluate(() => sessionStorage.getItem('phx-voice-greeted'))).toBeNull();
    await finishGreeting(page);
    await expect(page.locator('.phx-label')).toHaveText(TALK);
  });

  test("the captions follow the real recording's length: they stay up for the clip's duration and the label returns when it ends", async ({ page }) => {
    await ready(page);
    await page.locator('.phx-mute').click(); // muted playback runs in real time even without an audio device
    const duration = await page.evaluate(() => new Promise<number>((resolve) => {
      const a = document.querySelector('audio') as HTMLAudioElement;
      if (a.readyState >= 1) resolve(a.duration); else a.addEventListener('loadedmetadata', () => resolve(a.duration), { once: true });
    }));
    expect(duration).toBeGreaterThan(1); // the placeholder clip in this copy is 2 s; the real greeting is longer
    expect(duration).toBeLessThan(20);
    const t0 = Date.now();
    await phoenix(page).click();
    await expect(page.locator('.phx-caption')).toBeVisible();
    await page.waitForTimeout(Math.max(0, duration * 1000 - 1500)); // well before the end: still captioned, label still hidden
    await expect(page.locator('.phx-caption')).toBeVisible();
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-phase', 'greeting');
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-phase', 'talk', { timeout: 10_000 });
    const elapsed = (Date.now() - t0) / 1000;
    expect(elapsed).toBeGreaterThanOrEqual(duration - 0.4); // not cut short
    expect(elapsed).toBeLessThanOrEqual(duration + 2); // ends with the clip, not on the 12 s fallback timer
    await expect(page.locator('.phx-caption')).toBeHidden();
    await expect(page.locator('.phx-label')).toHaveText(TALK);
  });

  test('if play() is refused: captions still show, the state reads "blocked", and the label returns after a reading time', async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError')); });
    await ready(page);
    await phoenix(page).click();
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', 'blocked');
    await expect(page.locator('.phx-caption')).toHaveText(GREETING);
    await expect(page.locator('.phx-label')).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem('phx-voice-greeted'))).toBeNull();
    await page.clock.fastForward(10_000);
    await expect(page.locator('.phx-label')).toHaveText(TALK);
    await expect(page.locator('.phx-caption')).toBeHidden();
  });

  test('if the audio file cannot be loaded the captions still show', async ({ page }) => {
    await page.route('**/audio/greeting-en.mp3', (r) => r.abort());
    await ready(page);
    await phoenix(page).click();
    await expect(page.locator('.phx-voice')).toHaveAttribute('data-state', /failed|blocked/, { timeout: 10_000 });
    await expect(page.locator('.phx-caption')).toBeVisible();
  });

  test('failsafe: if the audio stalls the caption still goes and the label returns', async ({ page }) => {
    await page.clock.install();
    await ready(page);
    await page.locator('.phx-mute').click();
    await phoenix(page).click();
    await expect(page.locator('.phx-caption')).toBeVisible();
    await page.evaluate(() => { const a = document.querySelector('audio')!; a.pause(); a.dispatchEvent(new Event('stalled')); });
    await page.clock.fastForward(20_000);
    await expect(page.locator('.phx-label')).toHaveText(TALK);
    await expect(page.locator('.phx-caption')).toBeHidden();
  });

  test('blocked storage does not break anything', async ({ page }) => {
    await page.addInitScript(() => {
      const deny = () => { throw new DOMException('denied', 'SecurityError'); };
      Storage.prototype.getItem = deny;
      Storage.prototype.setItem = deny;
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await ready(page);
    await phoenix(page).click();
    await expect(page.locator('.phx-caption')).toHaveText(GREETING);
    await finishGreeting(page);
    await page.locator('.phx-mute').click();
    await expect(page.locator('.phx-mute')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('mute: toggles and is remembered across reloads', async ({ page }) => {
    await ready(page);
    const mute = page.locator('.phx-mute');
    await expect(mute).toHaveAttribute('aria-label', 'Mute Phoenix voice');
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(mute).toHaveAttribute('aria-label', 'Unmute Phoenix voice');
    expect(await page.evaluate(() => localStorage.getItem('phx-voice-muted'))).toBe('1');
    await page.reload();
    await page.waitForSelector('.phx-voice audio', { state: 'attached' });
    await expect(page.locator('.phx-mute')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.querySelector('audio')!.muted)).toBe(true);
    await page.locator('.phx-mute').click();
    expect(await page.evaluate(() => [localStorage.getItem('phx-voice-muted'), document.querySelector('audio')!.muted])).toEqual(['0', false]);
  });

  test('the pulse: a ring on the glyph every few seconds, switched off by prefers-reduced-motion', async ({ page, browser }) => {
    await ready(page);
    const ring = () => page.locator('.phx-glyph').evaluate((e) => { const c = getComputedStyle(e, '::after'); return [c.animationName, c.animationIterationCount, parseFloat(c.animationDuration) >= 2]; });
    expect(await ring()).toEqual(['phx-pulse', 'infinite', true]);
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 }, baseURL: 'http://localhost:4322' });
    const rm = await ctx.newPage();
    await rm.goto('/');
    await rm.waitForSelector('.phx-voice audio', { state: 'attached' });
    expect(await rm.locator('.phx-glyph').evaluate((e) => getComputedStyle(e, '::after').animationName)).toBe('none');
    expect(await rm.locator('.phx-label').evaluate((e) => [getComputedStyle(e).animationName, getComputedStyle(e).transitionDuration])).toEqual(['none', '0s']);
    await expect(rm.locator('.phx-label')).toBeVisible();
    await ctx.close();
  });

  test('the phoenix feels touchable: pointer cursor, a glow on hover and on keyboard focus, none at rest', async ({ page }) => {
    await ready(page);
    const bg = () => phoenix(page).evaluate((e) => getComputedStyle(e).backgroundImage);
    expect(await phoenix(page).evaluate((e) => getComputedStyle(e).cursor)).toBe('pointer');
    expect(await bg()).toBe('none');
    await phoenix(page).hover();
    await expect.poll(bg).toContain('radial-gradient');
    await page.mouse.move(5, 5);
    await expect.poll(bg).toBe('none');
    await page.keyboard.press('Tab'); // keyboard focus
    await phoenix(page).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await phoenix(page).evaluate((e) => document.activeElement === e)) ? bg() : 'none').toContain('radial-gradient');
    expect(await phoenix(page).evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
  });

  for (const [w, h, touch] of [[1440, 900, false], [1280, 800, false], [390, 844, true], [360, 740, true]] as const) {
    test(`${w}px: the label is in the first screen, on a dark pill, clear of the hero text and buttons (both wordings)`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, baseURL: 'http://localhost:4322' });
      const page = await ctx.newPage();
      await ready(page);
      const measure = () => page.evaluate(() => {
        const r = (el: Element) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const lab = r(document.querySelector('.phx-row')!);
        const others = ['.hero .eyebrow', '.hero h1', '.hero .lede', '.hero .cta-row', '#igniter'].map((s) => [s, r(document.querySelector(s)!)] as const);
        const hits = others.filter(([, o]) => lab.l < o.r && lab.r > o.l && lab.t < o.b && lab.b > o.t).map(([s]) => s);
        const cs = getComputedStyle(document.querySelector('.phx-label')!);
        return { inside: lab.l >= 0 && lab.r <= innerWidth && lab.t >= 0 && lab.b <= innerHeight, hits, bg: cs.backgroundColor, size: parseFloat(cs.fontSize) };
      });
      const a = await measure();
      expect(a.inside, JSON.stringify(a)).toBe(true);
      expect(a.hits).toEqual([]);
      expect(Number(/rgba?\(.*?,.*?,.*?,\s*([\d.]+)\)/.exec(a.bg)?.[1] ?? 1)).toBeGreaterThanOrEqual(0.7); // a mostly opaque dark pill
      expect(a.size).toBeGreaterThanOrEqual(11);
      await page.evaluate(() => { document.querySelector('.phx-voice')!.setAttribute('data-phase', 'talk'); document.querySelector('.phx-text')!.textContent = document.querySelector('.phx-text')!.textContent!.replace('to speak', 'to start talking'); }); // the longer wording
      const b = await measure();
      expect(b.inside, JSON.stringify(b)).toBe(true);
      expect(b.hits).toEqual([]);
      await ctx.close();
    });
  }

  test('on a touch phone the wording is "Tap" and the page does not overflow sideways', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL: 'http://localhost:4322' });
    const page = await ctx.newPage();
    await ready(page);
    await expect(page.locator('.phx-label')).toHaveText('Tap the phoenix to speak');
    await expect(phoenix(page)).toHaveAttribute('aria-label', 'Tap the phoenix to speak');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await page.locator('.phx-mute').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await ctx.close();
  });

  test('the phoenix area leaves the stage burst and the hero controls alone', async ({ page }) => {
    await ready(page);
    expect(await phoenix(page).evaluate((e) => e.closest('a,button,input,select,label,textarea,form,.bol,.log'))).toBeNull(); // the burst still runs on a click here
    for (const sel of ['.hero .cta-row a.btn-fire', '.hero .cta-row a.btn-ghost', '#f-co', '#igniter button']) {
      const top = await page.locator(sel).evaluate((e) => {
        const r = e.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!t && (t === e || e.contains(t));
      });
      expect(top, sel).toBe(true);
    }
  });

  test('without WebGL (no-stage) the whole voice UI is removed', async ({ page }) => {
    await ready(page);
    await page.waitForSelector('html.stage-on');
    await expect(page.locator('.phx-voice')).toHaveCount(1);
    await page.evaluate(() => document.documentElement.classList.add('no-stage'));
    await expect(page.locator('.phx-voice')).toHaveCount(0);
  });

  test('the header is as before (logo only, no nav)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header a')).toHaveCount(1);
    await expect(page.locator('header nav, header .btn, header audio, header .phx-mute')).toHaveCount(0);
  });

  test('?voicedebug=1: the readout shows state, phase, trigger, tapCount, audio values, play() result, storage keys, UA and audioSession, and updates', async ({ page }) => {
    await ready(page, '/?voicedebug=1');
    const box = page.locator('#voiceDebug');
    await expect(box).toBeVisible();
    expect(await box.evaluate((e) => { const c = getComputedStyle(e); return [c.position, Math.round(e.getBoundingClientRect().bottom) === innerHeight]; })).toEqual(['fixed', true]);
    for (const text of ['state=idle', 'phase=ready', 'trigger=none', 'tapCount=0', 'muted=false', 'volume=1', 'readyState=', 'currentTime=', 'play()=not called', 'greeted=absent', 'mutedKey=absent', 'audioSession=', 'ua: ']) await expect(box, text).toContainText(text);
    await phoenix(page).click();
    await expect(box).toContainText('trigger=phoenix');
    await expect(box).toContainText('tapCount=1');
    await expect(box).toContainText('phase=greeting');
    await expect(box).toContainText(/play\(\)=(pending|resolved)/);
    await expect(box).toContainText(/events: .*play@/, { timeout: 5000 });
    await expect(box).toContainText('greeted=1', { timeout: 15_000 });
    await phoenix(page).click();
    await expect(box).toContainText('tapCount=2');
  });

  test('the readout shows the error name and message when play() is refused', async ({ page }) => {
    await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('The request is not allowed by the user agent', 'NotAllowedError')); });
    await ready(page, '/?voicedebug=1');
    await phoenix(page).click();
    await expect(page.locator('#voiceDebug')).toContainText('play()=REJECTED NotAllowedError: The request is not allowed by the user agent');
    await expect(page.locator('#voiceDebug')).toContainText('state=blocked');
  });

  test('without the parameter there is no readout', async ({ page }) => {
    await ready(page);
    await expect(page.locator('#voiceDebug')).toHaveCount(0);
  });
});
