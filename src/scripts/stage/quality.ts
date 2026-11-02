// Device-aware quality for the stage. Visuals are identical across tiers; only density changes.
// Tiers only ever step down, never up.

export interface Tier {
  particles: number;
  embers: number;
  /** Upper bound for devicePixelRatio. */
  dprCap: number;
}

export const TIERS: readonly Tier[] = [
  { particles: 13000, embers: 560, dprCap: 2 },
  { particles: 6000, embers: 280, dprCap: 1.5 },
  { particles: 2500, embers: 280, dprCap: 1 },
];
export const LOWEST_TIER = TIERS.length - 1;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i;

export const isSoftwareRenderer = (name: string | null | undefined): boolean => !!name && SOFTWARE_RENDERER.test(name);

/** The unmasked renderer string, where the browser exposes it. */
export function readRendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  } catch {
    return null;
  }
}

/** Tier to start in. `forced` (from ?tier=) wins; software rendering gets the lowest tier. */
export function pickStartTier(o: { software: boolean; small: boolean; forced?: number | null }): number {
  if (o.forced != null && o.forced >= 0 && o.forced <= LOWEST_TIER) return o.forced;
  if (o.software) return LOWEST_TIER;
  return o.small ? 1 : 0;
}

export function forcedTierFromUrl(search: string): number | null {
  const v = new URLSearchParams(search).get('tier');
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n <= LOWEST_TIER ? n : null;
}

/**
 * Measures the average frame rate over a window of frames; if it is under `minFps`,
 * asks for one tier lower and measures again after a short settle. Stops once a window passes
 * or the lowest tier is reached.
 */
export class FpsGovernor {
  tier: number;
  lastFps = 0;
  done = false;
  private begin = -1;
  private frames = 0;
  private settleUntil = 0;

  constructor(
    startTier: number,
    private readonly opts = { windowMs: 2000, minFps: 40, settleMs: 500 },
  ) {
    this.tier = startTier;
    this.done = startTier >= LOWEST_TIER;
  }

  /** Call once per rendered frame with the rAF timestamp. Returns the new tier when it steps down. */
  frame(now: number): number | null {
    if (this.done || now < this.settleUntil) return null;
    if (this.begin < 0) {
      this.begin = now;
      this.frames = 0;
      return null;
    }
    this.frames++;
    const elapsed = now - this.begin;
    if (elapsed < this.opts.windowMs) return null;
    this.lastFps = (this.frames * 1000) / elapsed;
    this.begin = -1;
    if (this.lastFps >= this.opts.minFps) {
      this.done = true;
      return null;
    }
    this.tier++;
    if (this.tier >= LOWEST_TIER) this.done = true;
    else this.settleUntil = now + this.opts.settleMs;
    return this.tier;
  }

  /** Restart the current window (e.g. after the tab was hidden). */
  restart(): void {
    this.begin = -1;
  }
}
