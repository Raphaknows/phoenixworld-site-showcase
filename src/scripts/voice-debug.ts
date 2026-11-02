// ?voicedebug=1 readout for the voice greeting. Part of the PUBLIC_PHOENIX_VOICE chunk, so it only exists in preview builds.
export interface VoiceDebugSource {
  audio: HTMLAudioElement;
  state(): string;
  phase(): string;
  trigger(): string;
  taps(): number;
  playResult(): string;
  greeted(): string | null;
  mutedKey(): string | null;
}

export function mountVoiceDebug(src: VoiceDebugSource): void {
  const box = document.createElement('pre');
  box.id = 'voiceDebug';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;margin:0;padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px));' +
    'background:rgba(0,0,0,.88);color:#7CFC9A;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;pointer-events:none';
  document.body.append(box);

  const events: string[] = [];
  const t0 = performance.now();
  for (const name of ['play', 'playing', 'pause', 'ended', 'error', 'stalled', 'waiting', 'canplay', 'loadedmetadata', 'volumechange'])
    src.audio.addEventListener(name, () => {
      events.push(name + '@' + ((performance.now() - t0) / 1000).toFixed(1));
      if (events.length > 8) events.shift();
    });

  const ua = navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90);
  const draw = (): void => {
    const a = src.audio;
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    box.textContent =
      `state=${src.state()}  phase=${src.phase()}  trigger=${src.trigger()}  tapCount=${src.taps()}\n` +
      `muted=${a.muted}  volume=${a.volume}  readyState=${a.readyState}  networkState=${a.networkState}\n` +
      `currentTime=${a.currentTime.toFixed(2)}  duration=${Number.isFinite(a.duration) ? a.duration.toFixed(2) : '?'}  paused=${a.paused}  err=${a.error ? a.error.code : '-'}\n` +
      `play()=${src.playResult()}\n` +
      `storage: greeted=${src.greeted() === null ? 'absent' : src.greeted()}  mutedKey=${src.mutedKey() === null ? 'absent' : src.mutedKey()}\n` +
      `audioSession=${session ? 'yes type=' + session.type : 'no'}\n` +
      `events: ${events.join(' ')}\n` +
      `ua: ${ua}`;
  };
  draw();
  setInterval(draw, 250);
}
