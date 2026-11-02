// Loads the WebGL stage on demand: after first paint, and only if the browser can do WebGL.
// Anything that fails here falls through to the same no-WebGL state.
import { attachStage } from './bridge';
import { setSeq } from './hud';
import { $ } from './util';

const root = document.documentElement;

function noStage(): void {
  root.classList.add('no-stage');
  setSeq(1);
}

// One context only: probe on the real canvas and hand the same context to the renderer.
// (Three.js needs WebGL2, so there is nothing to gain from probing WebGL1.)
function getContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    return canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
}

async function load(): Promise<void> {
  const canvas = $<HTMLCanvasElement>('stage');
  const gl = getContext(canvas);
  if (!gl) return noStage();
  try {
    const { createStage } = await import('./stage/index');
    const api = createStage(canvas, gl);
    if (!api) return noStage();
    root.classList.add('stage-on');
    attachStage(api);
  } catch {
    noStage();
  }
}

const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
const start = (): void => {
  if (ric) ric(() => void load(), { timeout: 1200 });
  else setTimeout(() => void load(), 200);
};
if (document.readyState === 'complete') start();
else addEventListener('load', start, { once: true });
