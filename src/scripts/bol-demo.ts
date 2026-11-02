import { reduceMotion } from './util';

export function initBolDemo(): void {
  if (reduceMotion) return;
  const flds = document.querySelectorAll('.fld');
  const rows = document.querySelectorAll('.log .row');
  let step = 0;
  setInterval(() => {
    const n = step % 12;
    flds.forEach((f, i) => f.classList.toggle('lit', n < 6 ? i <= n : n < 10));
    rows.forEach((r, i) => r.classList.toggle('lit', n >= 6 && i <= n - 6));
    step++;
  }, 650);
}
