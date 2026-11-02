import { expect, type Page } from '@playwright/test';

export const GREETING =
  'Welcome to Phoenix World. How can I help you take your company into the future? Click on the phoenix to start speaking with me.';

declare global {
  interface Window {
    __plays: { inGesture: boolean; gesture: string; active: boolean | null; session: string | null; muted: boolean; volume: number }[];
    __talks: string[];
    __gesture: string;
  }
}

/**
 * Before the page loads: records every audio play() (was it called synchronously inside a click/keydown/touch handler, what the
 * audio session type was, muted/volume) and every "phoenix:talk" event. With stubSession an iOS-style navigator.audioSession exists.
 */
export const instrument = (page: Page, { stubSession = true }: { stubSession?: boolean } = {}) =>
  page.addInitScript(
    ({ stubSession }) => {
      window.__plays = [];
      window.__talks = [];
      window.__gesture = '';
      const types = ['click', 'keydown', 'keyup', 'submit', 'touchend', 'pointerup'];
      for (const t of types) document.addEventListener(t, () => { window.__gesture = window.__gesture || t; }, true); // first thing in the input event...
      for (const t of types) document.addEventListener(t, () => { if (window.__gesture === t) window.__gesture = ''; }); // ...cleared after every handler ran
      document.addEventListener('phoenix:talk', (e) => window.__talks.push((e as CustomEvent).detail.source));
      if (stubSession && !('audioSession' in navigator)) Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true, writable: true });
      const orig = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
        window.__plays.push({ inGesture: window.__gesture !== '', gesture: window.__gesture, active: navigator.userActivation ? navigator.userActivation.isActive : null, session: s ? s.type : null, muted: this.muted, volume: this.volume });
        return orig.call(this);
      };
    },
    { stubSession },
  );

export const plays = (page: Page) => page.evaluate(() => window.__plays);
export const talks = (page: Page) => page.evaluate(() => window.__talks);

export const ready = async (page: Page, url = '/') => {
  await page.goto(url);
  await page.waitForSelector('.phx-voice audio', { state: 'attached', timeout: 20_000 });
};

/** Gets the greeting to its end. Headless Chromium has no audio sink, so an unmuted clip can sit at 0:00: jump to the end, and if
 *  the real 'ended' event still has not come, dispatch it (muted playback in the tests covers the real end). */
export const finishGreeting = async (page: Page) => {
  await page.evaluate(() => {
    const a = document.querySelector('.phx-voice audio') as HTMLAudioElement;
    a.playbackRate = 16;
    if (a.duration) a.currentTime = Math.max(0, a.duration - 0.3);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const a = document.querySelector('.phx-voice audio') as HTMLAudioElement;
    if (!a.ended) a.dispatchEvent(new Event('ended'));
  });
  await expect(page.locator('.phx-voice')).toHaveAttribute('data-phase', 'talk', { timeout: 5_000 });
};
