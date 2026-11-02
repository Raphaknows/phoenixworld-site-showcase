// Phoenix voice (behind PUBLIC_PHOENIX_VOICE, see main.ts: with the flag off this module is never bundled).
// The phoenix itself is the trigger. A label next to it invites the visitor to click/tap it; the first activation plays the
// greeting (once per tab session) with captions, and every activation after that dispatches "phoenix:talk" and nothing else
// (the conversation is built separately). Ignite is unrelated and plays nothing.
import './voice.css';

const TEXT =
  'Welcome to Phoenix World. How can I help you take your company into the future? Click on the phoenix to start speaking with me.';
const SRC = '/audio/greeting-en.mp3';
const SEEN_KEY = 'phx-voice-greeted'; // sessionStorage: greeted once this session
const MUTE_KEY = 'phx-voice-muted'; // localStorage: the visitor's mute choice

const read = (area: 'sessionStorage' | 'localStorage', key: string): string | null => {
  try {
    return window[area].getItem(key);
  } catch {
    return null;
  }
};
const write = (area: 'sessionStorage' | 'localStorage', key: string, value: string): void => {
  try {
    window[area].setItem(key, value);
  } catch {
    /* storage can be blocked (private windows, site data off): the page still works without it */
  }
};

const touch = matchMedia('(hover: none)').matches;
const VERB = touch ? 'Tap' : 'Click';
const LABEL_SPEAK = `${VERB} the phoenix to speak`;
const LABEL_TALK = `${VERB} the phoenix to start talking`;

// iOS 17+ / Safari 16.4+: without this the ringer switch silences web audio. 'playback' plays through silent mode.
const useSpeakerSession = (): void => {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch {
    /* an older or stricter WebKit: nothing to set */
  }
};

const GLYPH =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_ON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_OFF =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

type Phase = 'ready' | 'greeting' | 'talk';

export function initVoice(): void {
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!hero) return;

  const root = document.createElement('div');
  root.className = 'phx-voice';
  root.innerHTML =
    `<div class="phx-talk" role="button" tabindex="0"></div>` +
    `<div class="phx-dock">` +
    `<p class="phx-caption" role="status" aria-live="polite" hidden></p>` +
    `<div class="phx-row"><p class="phx-label" aria-hidden="true"><span class="phx-glyph">${GLYPH}</span><span class="phx-text"></span></p>` +
    `<button class="phx-mute" type="button"></button></div></div>` +
    `<audio preload="auto"></audio>`;
  hero.append(root);

  const talk = root.querySelector<HTMLElement>('.phx-talk')!;
  const caption = root.querySelector<HTMLElement>('.phx-caption')!;
  const label = root.querySelector<HTMLElement>('.phx-label')!;
  const labelText = root.querySelector<HTMLElement>('.phx-text')!;
  const mute = root.querySelector<HTMLButtonElement>('.phx-mute')!;
  const audio = root.querySelector<HTMLAudioElement>('audio')!;
  audio.src = SRC; // created once, early, with its source already set; play() is only ever called inside the phoenix tap
  audio.load();

  let muted = read('localStorage', MUTE_KEY) === '1';
  let phase: Phase = read('sessionStorage', SEEN_KEY) === '1' ? 'talk' : 'ready'; // already greeted this session: straight to "start talking"
  let started = false; // this page load has already started the greeting (the trigger was the phoenix)
  let taps = 0;
  let playResult = 'not called';
  let failsafe = 0;

  // data-state is for debugging: idle -> playing -> ended, or blocked / failed when no sound could be produced
  const setState = (state: string): void => {
    root.dataset.state = state;
  };
  setState('idle');

  // The label follows the phase: invitation, hidden while the greeting plays, then "start talking".
  const syncLabel = (): void => {
    const text = phase === 'ready' ? LABEL_SPEAK : LABEL_TALK;
    labelText.textContent = text;
    talk.setAttribute('aria-label', text);
    label.classList.toggle('off', phase === 'greeting');
    root.dataset.phase = phase;
  };
  syncLabel();

  const paint = (): void => {
    mute.innerHTML = muted ? ICON_OFF : ICON_ON;
    mute.setAttribute('aria-pressed', String(muted));
    mute.setAttribute('aria-label', muted ? 'Unmute Phoenix voice' : 'Mute Phoenix voice');
    audio.muted = muted;
  };
  paint();
  mute.addEventListener('click', () => {
    muted = !muted;
    write('localStorage', MUTE_KEY, muted ? '1' : '0');
    paint();
  });

  // The greeting is over (it ended, stalled past its length, or was refused and its captions have been read).
  const finishGreeting = (): void => {
    clearTimeout(failsafe);
    caption.hidden = true;
    phase = 'talk';
    syncLabel();
  };
  // No sound (the browser refused, or the file would not load): the captions are still the message, so they stay up for a
  // reading time before the label returns, instead of the whole thing vanishing silently.
  const noSound = (state: string, why: unknown): void => {
    setState(state);
    console.warn('Phoenix voice: no sound (' + state + ')', why);
    clearTimeout(failsafe);
    failsafe = window.setTimeout(finishGreeting, 9000);
  };

  audio.addEventListener('ended', () => {
    setState('ended');
    finishGreeting();
  });
  audio.addEventListener('playing', () => {
    if (muted) return; // silent playback only times the captions; the state stays "blocked"
    setState('playing');
    write('sessionStorage', SEEN_KEY, '1'); // greeted once sound has really started
  });
  audio.addEventListener('loadedmetadata', () => {
    // a real file may be longer than the placeholder: the failsafe follows the clip's own length
    if (phase === 'greeting' && failsafe) {
      clearTimeout(failsafe);
      failsafe = window.setTimeout(finishGreeting, ((audio.duration || 9) + 3) * 1000);
    }
  });
  audio.addEventListener('error', () => {
    if (started && phase === 'greeting') noSound('failed', audio.error);
  });

  // First activation: the greeting. play() is called right here, synchronously inside the phoenix tap (nothing awaited first).
  const greet = (): void => {
    started = true;
    phase = 'greeting';
    syncLabel();
    caption.textContent = TEXT;
    caption.hidden = false;
    audio.muted = muted; // a muted visitor still gets the captions, timed by the silent playback
    useSpeakerSession();
    if (muted) setState('blocked');
    // if the audio ever stalls (no output device, a broken stream) the caption must not stay up for ever
    failsafe = window.setTimeout(finishGreeting, 12_000);
    playResult = 'pending';
    const refused = (err: unknown): void => {
      const e = err as { name?: string; message?: string } | null;
      playResult = 'REJECTED ' + (e?.name ?? '?') + ': ' + (e?.message ?? '');
      noSound('blocked', err);
    };
    try {
      const promise = audio.play() as Promise<void> | undefined; // very old WebKit returns nothing
      if (promise && typeof promise.then === 'function') promise.then(() => (playResult = 'resolved'), refused);
      else playResult = 'started (no promise)';
    } catch (err) {
      refused(err);
    }
  };

  const activate = (source: 'click' | 'key'): void => {
    taps++;
    if (phase === 'greeting') return; // a tap during the greeting does nothing (no double play)
    if (phase === 'talk') {
      // the Phoenix AI conversation is built separately: tell the rest of the page, nothing else
      document.dispatchEvent(new CustomEvent('phoenix:talk', { bubbles: true, detail: { source } }));
      return;
    }
    greet();
  };
  talk.addEventListener('click', () => activate('click'));
  talk.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    activate('key');
  });

  if (new URLSearchParams(location.search).get('voicedebug') === '1') {
    void import('./voice-debug').then((m) =>
      m.mountVoiceDebug({
        audio,
        state: () => root.dataset.state ?? '',
        phase: () => phase,
        trigger: () => (started ? 'phoenix' : 'none'),
        taps: () => taps,
        playResult: () => playResult,
        greeted: () => read('sessionStorage', SEEN_KEY),
        mutedKey: () => read('localStorage', MUTE_KEY),
      }),
    );
  }

  // No WebGL means no phoenix on the page: take the whole thing away.
  const drop = (): void => {
    audio.pause();
    root.remove();
    obs.disconnect();
  };
  const obs = new MutationObserver(() => {
    if (document.documentElement.classList.contains('no-stage')) drop();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (document.documentElement.classList.contains('no-stage')) drop();
}
