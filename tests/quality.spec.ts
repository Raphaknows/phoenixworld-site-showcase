import { expect, test, type Page } from '@playwright/test';
import {
  FpsGovernor, LOWEST_TIER, TIERS, forcedTierFromUrl, isSoftwareRenderer, pickStartTier,
} from '../src/scripts/stage/quality';

// Pretend the GPU is a real one, so the stage does not start in the software tier.
const fakeGpu = (page: Page) =>
  page.addInitScript(() => {
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const orig = C.prototype.getParameter;
      C.prototype.getParameter = function (p: number) {
        return p === 0x9246 ? 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' : orig.call(this, p);
      };
    }
  });
const attr = (page: Page, name: string) => page.evaluate((n) => document.documentElement.dataset[n], name);
const ready = (page: Page) => page.waitForSelector('html.stage-on');

test.describe('tier selection (pure)', () => {
  test('software renderer strings', () => {
    for (const r of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Microsoft Basic Render Driver',
    ]) expect(isSoftwareRenderer(r)).toBe(true);
    for (const r of ['ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'NVIDIA GeForce RTX 4070', 'Adreno (TM) 740', null])
      expect(isSoftwareRenderer(r)).toBe(false);
  });

  test('start tier', () => {
    expect(pickStartTier({ software: false, small: false })).toBe(0);
    expect(pickStartTier({ software: false, small: true })).toBe(1);
    expect(pickStartTier({ software: true, small: false })).toBe(LOWEST_TIER);
    expect(pickStartTier({ software: true, small: true, forced: 0 })).toBe(0);
    expect(forcedTierFromUrl('?tier=1')).toBe(1);
    expect(forcedTierFromUrl('?tier=9')).toBeNull();
    expect(forcedTierFromUrl('?tier=x')).toBeNull();
    expect(forcedTierFromUrl('')).toBeNull();
  });

  test('tiers are the agreed densities and only get lighter', () => {
    expect(TIERS.map((t) => t.particles)).toEqual([13000, 6000, 2500]);
    expect(TIERS.map((t) => t.dprCap)).toEqual([2, 1.5, 1]);
    expect(TIERS[2].embers).toBe(TIERS[0].embers / 2);
  });
});

test.describe('fps governor (pure)', () => {
  const run = (g: FpsGovernor, fps: number, fromMs: number, forMs: number): number[] => {
    const steps: number[] = [];
    for (let t = fromMs; t <= fromMs + forMs; t += 1000 / fps) {
      const n = g.frame(t);
      if (n !== null) steps.push(n);
    }
    return steps;
  };

  test('60 fps stays put', () => {
    const g = new FpsGovernor(0);
    expect(run(g, 60, 0, 6000)).toEqual([]);
    expect(g.tier).toBe(0);
    expect(g.done).toBe(true);
  });

  test('exactly at the threshold is fine, just under steps down', () => {
    const a = new FpsGovernor(0);
    expect(run(a, 41, 0, 3000)).toEqual([]);
    const b = new FpsGovernor(0);
    expect(run(b, 38, 0, 3000)).toEqual([1]);
  });

  test('30 fps steps 0 -> 1 -> 2 in successive windows, then stops', () => {
    const g = new FpsGovernor(0);
    expect(run(g, 30, 0, 12000)).toEqual([1, 2]);
    expect(g.tier).toBe(2);
    expect(g.done).toBe(true);
  });

  test('never steps up, even when the frame rate recovers', () => {
    const g = new FpsGovernor(0);
    expect(run(g, 30, 0, 2600)).toEqual([1]);
    expect(run(g, 120, 2700, 10000)).toEqual([]);
    expect(g.tier).toBe(1);
  });

  test('starting in the lowest tier never measures', () => {
    const g = new FpsGovernor(LOWEST_TIER);
    expect(run(g, 5, 0, 10000)).toEqual([]);
    expect(g.tier).toBe(LOWEST_TIER);
  });

  test('restart discards a partial window (tab hidden)', () => {
    const g = new FpsGovernor(0);
    run(g, 60, 0, 1500);
    g.restart();
    // a huge gap while hidden must not count as one slow window
    expect(g.frame(60000)).toBeNull();
    expect(run(g, 60, 60016, 3000)).toEqual([]);
  });
});

test.describe('tiers in the browser', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  test('tier 2: software rendering starts low (2,500 particles, halved embers, DPR 1)', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    expect(await attr(page, 'stageRenderer')).toMatch(/swiftshader/i);
    expect(await attr(page, 'stageStart')).toBe('2');
    expect(await attr(page, 'stageParticles')).toBe('2500');
    expect(await attr(page, 'stageEmbers')).toBe('280');
    expect(await attr(page, 'stageDpr')).toBe('1');
    await expect(page.locator('#seqPct')).toHaveText('100%', { timeout: 10000 });
    await page.waitForTimeout(3500);
    expect(await attr(page, 'stageTier')).toBe('2'); // nothing below the lowest tier
  });

  test('tier 0: a capable GPU starts at the full 13,000 and DPR up to 2', async ({ page }) => {
    await fakeGpu(page);
    await page.goto('/');
    await ready(page);
    expect(await attr(page, 'stageStart')).toBe('0');
    expect(await attr(page, 'stageParticles')).toBe('13000');
    expect(await attr(page, 'stageEmbers')).toBe('560');
    expect(await attr(page, 'stageDpr')).toBe('2');
  });

  test('forced ?tier=0 keeps full density with no runtime step-down', async ({ page }) => {
    await page.goto('/?tier=0');
    await ready(page);
    expect(await attr(page, 'stageParticles')).toBe('13000');
    await page.waitForTimeout(9000);
    expect(await attr(page, 'stageTier')).toBe('0');
  });

  test('runtime step-down: a slow GPU steps down, never up, and state matches the tier', async ({ page }) => {
    test.setTimeout(60000);
    await fakeGpu(page);
    await page.goto('/');
    await ready(page);
    const seen: number[] = [];
    const deadline = Date.now() + 30000;
    // keep sampling until it has stepped down and then held still for a while
    let stableSince = 0;
    while (Date.now() < deadline) {
      const t = Number(await attr(page, 'stageTier'));
      if (seen.length && t !== seen.at(-1)) stableSince = 0;
      else if (!stableSince) stableSince = Date.now();
      seen.push(t);
      if (t >= 1 && Date.now() - stableSince > 4000) break;
      await page.waitForTimeout(400);
    }
    const last = seen.at(-1)!;
    expect(last).toBeGreaterThanOrEqual(1); // 13,000 particles + DPR 2 is under 40 fps on software GL
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(await attr(page, 'stageParticles')).toBe(String(TIERS[last].particles));
    expect(await attr(page, 'stageEmbers')).toBe(String(TIERS[last].embers));
    expect(await attr(page, 'stageDpr')).toBe(String(TIERS[last].dprCap));
  });
});

test.describe('tier 1 on a phone-size viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });

  test('a capable GPU starts at 6,000 particles, DPR capped at 1.5', async ({ page }) => {
    await fakeGpu(page);
    await page.goto('/');
    await ready(page);
    expect(await attr(page, 'stageStart')).toBe('1');
    expect(await attr(page, 'stageParticles')).toBe('6000');
    expect(await attr(page, 'stageDpr')).toBe('1.5');
  });

  test('forced ?tier=1 ignores the renderer', async ({ page }) => {
    await page.goto('/?tier=1');
    await ready(page);
    expect(await attr(page, 'stageParticles')).toBe('6000');
    expect(await attr(page, 'stageDpr')).toBe('1.5');
  });
});

test.describe('tier 1 on a DPR 1 screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('a cap never scales a device up', async ({ page }) => {
    await page.goto('/?tier=1');
    await ready(page);
    expect(await attr(page, 'stageDpr')).toBe('1');
  });
});
