import type { Page } from '@playwright/test';

/**
 * Resolves once a scroll has finished: scrollY is unchanged across three consecutive animation frames
 * (two frame-to-frame comparisons), after it has first moved away from `from`. If it never moves
 * within `idleMs` (already in place, or nothing scrolled) it settles as-is, so the caller's own
 * assertion decides. Replaces fixed waits, which are too short for a long smooth scroll when
 * several software-WebGL pages share the CPU.
 */
export const scrollSettled = (page: Page, from: number, { timeout = 30_000, idleMs = 1500 } = {}): Promise<number> =>
  page.evaluate(
    ({ from, timeout, idleMs }) =>
      new Promise<number>((resolve, reject) => {
        const t0 = performance.now();
        let moved = false;
        let prev = scrollY;
        let still = 0;
        const frame = (): void => {
          const y = scrollY;
          const elapsed = performance.now() - t0;
          if (y !== from) moved = true;
          still = y === prev ? still + 1 : 0;
          prev = y;
          if ((moved || elapsed > idleMs) && still >= 2) return resolve(y);
          if (elapsed > timeout) return reject(new Error(`scroll still moving after ${timeout}ms (scrollY ${y})`));
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    { from, timeout, idleMs },
  );
