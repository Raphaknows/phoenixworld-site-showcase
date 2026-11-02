import { reduceMotion } from './util';

// Text is visible at rest; this re-runs the letters once as a heading scrolls in.
export function initScramble(): void {
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  const glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#<>';
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const el = en.target as HTMLElement;
        const final = el.textContent ?? '';
        const start = performance.now();
        const dur = 700;
        el.setAttribute('aria-label', final);
        const tick = (now: number): void => {
          const p = Math.min(1, (now - start) / dur);
          let out = '';
          for (let i = 0; i < final.length; i++) {
            const c = final[i];
            out += c === ' ' || i / final.length < p ? c : glyphs[(Math.random() * glyphs.length) | 0];
          }
          el.textContent = out;
          if (p < 1) requestAnimationFrame(tick);
          else el.textContent = final;
        };
        tick(start);
      });
    },
    { threshold: 0.6 },
  );
  document.querySelectorAll('[data-scramble]').forEach((h) => io.observe(h));
}
