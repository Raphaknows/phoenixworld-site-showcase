// Point-cloud targets for the stage: sampled glyph/shape, and the data lattice.

/** Sample any filled shape drawn on a 1000x800 canvas into n points (world units, 10 wide). */
export function sampleShape(draw: (g: CanvasRenderingContext2D) => void, n: number, edgeShare: number): Float32Array | null {
  const c = document.createElement('canvas');
  c.width = 1000;
  c.height = 800;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  draw(g);
  const d = g.getImageData(0, 0, 1000, 800).data;
  let inside: number[] = [];
  let edge: number[] = [];
  for (let y = 2; y < 798; y += 2)
    for (let x = 2; x < 998; x += 2) {
      const i = (y * 1000 + x) * 4 + 3;
      if (d[i] > 128) {
        const e = d[i - 8] < 128 || d[i + 8] < 128 || d[i - 8000] < 128 || d[i + 8000] < 128;
        (e ? edge : inside).push(x, y);
      }
    }
  if (!inside.length && !edge.length) return null;
  if (!inside.length) inside = edge;
  if (!edge.length) edge = inside;
  const out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const src = Math.random() < edgeShare ? edge : inside;
    const j = ((Math.random() * src.length) / 2 | 0) * 2;
    const px = src[j] + (Math.random() - 0.5) * 2;
    const py = src[j + 1] + (Math.random() - 0.5) * 2;
    const X = (px - 500) * 0.01;
    const Y = -(py - 430) * 0.01;
    out[k * 3] = X;
    out[k * 3 + 1] = Y;
    out[k * 3 + 2] = (Math.random() - 0.5) * 0.5 + (1 - Math.min(1, Math.abs(X) / 5)) * 0.3;
  }
  return out;
}

export function drawText(name: string): (g: CanvasRenderingContext2D) => void {
  return (g) => {
    const t = name.toUpperCase();
    let lines = [t];
    if (t.length > 13 && t.indexOf(' ') > 0) {
      const mid = t.length / 2;
      let best = -1;
      for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
      lines = [t.slice(0, best), t.slice(best + 1)];
    }
    let fs = 300;
    do {
      g.font = '700 ' + fs + 'px "Chakra Petch", "Barlow", sans-serif';
      const w = Math.max(...lines.map((l) => g.measureText(l).width));
      if (w <= 930 && fs * 1.05 * lines.length <= 560) break;
      fs -= 8;
    } while (fs > 40);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = fs * 1.02;
    const y0 = 430 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => g.fillText(l, 500, y0 + i * lh));
  };
}

export function lattice(n: number): Float32Array {
  const NX = 8, NY = 5, NZ = 4, S = 2.5;
  const out = new Float32Array(n * 3);
  const node = (i: number, j: number, k: number): number[] => [
    (i - (NX - 1) / 2) * S,
    (j - (NY - 1) / 2) * S * 0.9,
    (k - (NZ - 1) / 2) * S,
  ];
  for (let p = 0; p < n; p++) {
    const i = (Math.random() * NX) | 0, j = (Math.random() * NY) | 0, k = (Math.random() * NZ) | 0;
    const a = node(i, j, k);
    let pt: number[];
    if (Math.random() < 0.16) {
      pt = [a[0] + (Math.random() - 0.5) * 0.12, a[1] + (Math.random() - 0.5) * 0.12, a[2] + (Math.random() - 0.5) * 0.12];
    } else {
      const axis = (Math.random() * 3) | 0;
      let b: number[];
      if (axis === 0 && i < NX - 1) b = node(i + 1, j, k);
      else if (axis === 1 && j < NY - 1) b = node(i, j + 1, k);
      else if (k < NZ - 1) b = node(i, j, k + 1);
      else b = node(Math.max(0, i - 1), j, k);
      const t = Math.random();
      pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    out[p * 3] = pt[0];
    out[p * 3 + 1] = pt[1];
    out[p * 3 + 2] = pt[2];
  }
  return out;
}
