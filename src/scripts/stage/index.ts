import {
  AdditiveBlending, BufferAttribute, BufferGeometry, PerspectiveCamera, Points, Scene,
  ShaderMaterial, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { bridge, type StageApi } from '../bridge';
import { setSeq, setSeqState } from '../hud';
import { $, clamp, reduceMotion as reduce } from '../util';
import { PHOENIX } from './phoenix-path';
import { drawText, lattice, sampleShape } from './shapes';
import {
  FpsGovernor, TIERS, forcedTierFromUrl, isSoftwareRenderer, pickStartTier, readRendererName,
} from './quality';
import { emberFrag, emberVert, frag, vert } from './shaders';

/** Builds the single fixed stage: ashes → phoenix (intro), phoenix → lattice (scroll), lattice → phoenix (audit). */
export function createStage(canvas: HTMLCanvasElement, context: WebGL2RenderingContext): StageApi | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, context, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x06080b, 1);
  // device-aware quality: software renderers start low; a slow first couple of seconds steps down
  const rendererName = readRendererName(renderer.getContext());
  const forced = forcedTierFromUrl(location.search);
  const small = Math.min(innerWidth, innerHeight) < 700;
  const startTier = pickStartTier({ software: isSoftwareRenderer(rendererName), small, forced });
  let tier = startTier;
  const deviceDpr = window.devicePixelRatio || 1;
  const dprFor = (t: number): number => Math.min(deviceDpr, TIERS[t].dprCap);
  const DPR = dprFor(tier);
  renderer.setPixelRatio(DPR);
  const publish = (): void => {
    const d = document.documentElement.dataset;
    d.stageTier = String(tier);
    d.stageStart = String(startTier);
    d.stageParticles = String(TIERS[tier].particles);
    d.stageEmbers = String(TIERS[tier].embers);
    d.stageDpr = String(dprFor(tier));
    d.stageRenderer = rendererName ?? '';
  };
  publish();

  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const N = TIERS[startTier].particles;

  const ash = new Float32Array(N * 3);
  const rnd = new Float32Array(N * 4);
  for (let q = 0; q < N; q++) {
    ash[q * 3] = (Math.random() - 0.5) * 22;
    ash[q * 3 + 1] = -4.2 - Math.random() * 3.2;
    ash[q * 3 + 2] = (Math.random() - 0.5) * 6;
    rnd[q * 4] = Math.random();
    rnd[q * 4 + 1] = 0.9 + Math.random() * 1.6;
    rnd[q * 4 + 2] = Math.random();
    rnd[q * 4 + 3] = Math.random();
  }
  const phxPts = sampleShape((g) => g.fill(new Path2D(PHOENIX)), N, 0.38)!;
  const txtAttr = new BufferAttribute(new Float32Array(phxPts), 3);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aAsh', new BufferAttribute(ash, 3));
  geo.setAttribute('aPhx', new BufferAttribute(phxPts, 3));
  geo.setAttribute('aTxt', txtAttr);
  geo.setAttribute('aLat', new BufferAttribute(lattice(N), 3));
  geo.setAttribute('aRnd', new BufferAttribute(rnd, 4));

  const uniforms = {
    uTime: { value: 0 }, uIntro: { value: reduce ? 1 : 0 }, uMorph: { value: 0 }, uText: { value: 0 },
    uPx: { value: DPR }, uScale: { value: 0.8 }, uOffset: { value: new Vector2(3.6, 0) },
    uFlap: { value: reduce ? 0 : 1 }, uPointer: { value: new Vector2(99, 99) },
    uPush: { value: 0 }, uBurst: { value: 0 }, uBurstAt: { value: new Vector2(99, 99) },
    uHeat: { value: bridge.heat }, uRise: { value: 0 },
  };

  const mat = new ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const phoenixPoints = new Points(geo, mat);
  scene.add(phoenixPoints);

  // rising embers, faster and brighter as the calculator's number grows
  const EN = TIERS[startTier].embers;
  const ebase = new Float32Array(EN * 3);
  const erd = new Float32Array(EN * 2);
  for (let e = 0; e < EN; e++) {
    ebase[e * 3] = (Math.random() - 0.5) * 26;
    ebase[e * 3 + 1] = Math.random() * 16;
    ebase[e * 3 + 2] = (Math.random() - 0.5) * 8 - 1;
    erd[e * 2] = 0.25 + Math.random() * 0.7;
    erd[e * 2 + 1] = Math.random() * 6.28;
  }
  const egeo = new BufferGeometry();
  egeo.setAttribute('position', new BufferAttribute(ebase, 3));
  egeo.setAttribute('aR', new BufferAttribute(erd, 2));
  const emat = new ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uPx: uniforms.uPx, uRise: uniforms.uRise, uHeat: uniforms.uHeat },
    vertexShader: emberVert, fragmentShader: emberFrag,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const emberPoints = new Points(egeo, emat);
  scene.add(emberPoints);

  // layout targets
  const heroOff = new Vector2();
  const auditOff = new Vector2();
  const render = (): void => {
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };
  function resize(): void {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (w >= 900) {
      heroOff.set(3.9, -0.1);
      auditOff.set(-4.6, 0.2);
      uniforms.uScale.value = 0.8;
    } else {
      uniforms.uScale.value = Math.min(0.8, (w / h) * 1.05);
      heroOff.set(0, 2.5);
      auditOff.set(0, 2.5);
    }
    if (reduce) render();
  }
  addEventListener('resize', resize);

  const hero = document.querySelector<HTMLElement>('.hero')!;
  const audit = $('audit');
  let morphTarget = 0, reformAmt = 0, textName = '', textUntil = 0;
  const stateLabel = (): string => {
    if (textName && performance.now() < textUntil) return 'Reborn: ' + textName.toUpperCase();
    return morphTarget > 0.5 ? 'Phoenix → Systems' : reformAmt > 0.5 ? 'Systems → Phoenix' : 'Ashes → Phoenix';
  };
  function readScroll(): void {
    const m1 = clamp(scrollY / (hero.offsetHeight * 0.75), 0, 1);
    const r = audit.getBoundingClientRect();
    reformAmt = clamp((innerHeight - r.top) / (innerHeight * 0.7), 0, 1);
    morphTarget = m1 * (1 - reformAmt);
    setSeqState(stateLabel());
    if (reduce) {
      uniforms.uMorph.value = morphTarget;
      uniforms.uOffset.value.copy(reformAmt > 0.5 ? auditOff : heroOff);
      render();
    }
  }
  addEventListener('scroll', readScroll, { passive: true });

  const t0 = performance.now();
  const api: StageApi = {
    ignite(name, hold, scrollToHero) {
      const build = (): void => {
        const pts = sampleShape(drawText(name), N, 0.45);
        if (!pts) return;
        (txtAttr.array as Float32Array).set(pts);
        txtAttr.needsUpdate = true;
        textName = name;
        const start = Math.max(performance.now(), t0 + 350 + 2600 + 500);
        textUntil = start + hold;
        setSeqState(stateLabel());
        if (scrollToHero && scrollY > hero.offsetHeight * 0.4) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        if (reduce) {
          uniforms.uText.value = 1;
          render();
          setTimeout(() => {
            uniforms.uText.value = 0;
            setSeqState(stateLabel());
            render();
          }, hold);
        }
      };
      if (document.fonts && document.fonts.load) document.fonts.load('700 120px "Chakra Petch"').then(build, build);
      else build();
    },
  };

  // step down one tier: same buffers, fewer points drawn (points are independent random samples)
  function applyTier(t: number): void {
    tier = t;
    geo.setDrawRange(0, Math.min(TIERS[t].particles, N));
    egeo.setDrawRange(0, Math.min(TIERS[t].embers, EN));
    if (dprFor(t) !== uniforms.uPx.value) {
      renderer.setPixelRatio(dprFor(t));
      uniforms.uPx.value = dprFor(t);
      resize();
    }
    publish();
  }
  const governor = forced === null && !reduce ? new FpsGovernor(startTier) : null;

  // pointer: wind on move, burst on click in empty space
  const ndc = new Vector2(9, 9);
  const tmp = new Vector3();
  let lastMove = -1e9;
  function toWorld(nx: number, ny: number, out: Vector2): void {
    tmp.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    const k = -camera.position.z / tmp.z;
    out.set(camera.position.x + tmp.x * k, camera.position.y + tmp.y * k);
  }
  const mouse = { x: 0, y: 0 };
  const cam = { x: 0, y: 0 };
  addEventListener(
    'pointermove',
    (ev) => {
      mouse.x = (ev.clientX / innerWidth) * 2 - 1;
      mouse.y = (ev.clientY / innerHeight) * 2 - 1;
      ndc.set(mouse.x, -mouse.y);
      lastMove = performance.now();
    },
    { passive: true },
  );
  addEventListener('pointerdown', (ev) => {
    const t = ev.target as Element | null;
    if (reduce || (t?.closest && t.closest('a,button,input,select,label,textarea,form,.bol,.log'))) return;
    toWorld((ev.clientX / innerWidth) * 2 - 1, -((ev.clientY / innerHeight) * 2 - 1), uniforms.uBurstAt.value);
    uniforms.uBurst.value = 1;
  });

  resize();
  readScroll();
  uniforms.uOffset.value.copy(heroOff);

  if (reduce) {
    setSeq(1);
    render();
    return api;
  }

  let last = t0, running = true, rise = 0;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    governor?.restart();
    if (running) {
      last = performance.now();
      requestAnimationFrame(loop);
    }
  });
  function loop(now: number): void {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const U = uniforms;
    U.uTime.value += dt;
    const intro = clamp((now - t0 - 350) / 2600, 0, 1);
    U.uIntro.value = intro;
    if (governor && intro >= 1) {
      const next = governor.frame(now);
      if (next !== null) applyTier(next);
    }
    setSeq(intro);
    U.uMorph.value += (morphTarget - U.uMorph.value) * Math.min(1, dt * 3);
    const tTarget = intro >= 1 && now < textUntil ? 1 : 0;
    U.uText.value += (tTarget - U.uText.value) * Math.min(1, dt * 2.2);
    if (textName && now > textUntil && now - textUntil < 60) setSeqState(stateLabel());
    const tgt = reformAmt > 0.5 ? auditOff : heroOff;
    U.uOffset.value.x += (tgt.x - U.uOffset.value.x) * Math.min(1, dt * 2);
    U.uOffset.value.y += (tgt.y - U.uOffset.value.y) * Math.min(1, dt * 2);
    U.uHeat.value += (bridge.heat - U.uHeat.value) * Math.min(1, dt * 2);
    rise += dt * (0.45 + U.uHeat.value * 1.8);
    U.uRise.value = rise;
    U.uBurst.value = Math.max(0, U.uBurst.value - dt * 0.85);
    const moving = now - lastMove < 1400;
    U.uPush.value += ((moving ? 1 : 0) - U.uPush.value) * Math.min(1, dt * 4);
    cam.x += (mouse.x * 0.8 - cam.x) * dt * 2;
    cam.y += (-mouse.y * 0.5 - cam.y) * dt * 2;
    camera.position.x = cam.x + Math.sin(U.uTime.value * 0.15) * 0.4;
    camera.position.y = cam.y;
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    if (moving) toWorld(ndc.x, ndc.y, U.uPointer.value);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return api;
}
