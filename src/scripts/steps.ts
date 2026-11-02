import { $, clamp, reduceMotion } from './util';

export function initSteps(): void {
  const el = $('steps');
  const fill = (): void => {
    const r = el.getBoundingClientRect();
    const vh = innerHeight;
    const p = clamp((vh * 0.85 - r.top) / (vh * 0.6), 0, 1);
    el.style.setProperty('--fill', reduceMotion ? '1' : p.toFixed(3));
  };
  addEventListener('scroll', fill, { passive: true });
  addEventListener('resize', fill);
  fill();
}
