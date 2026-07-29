import { tgpu, d, std, common } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const cleanupController = new AbortController();
const { signal } = cleanupController;

canvas.style.touchAction = 'none';

const Params = d.struct({
  sphereSpacing: d.f32,
  maxDistance: d.f32,
  maxSteps: d.i32,
  sphereRadius: d.f32,
  waveFreqX: d.f32,
  waveFreqY: d.f32,
  waveAmplitude: d.f32,
  twistFactor: d.f32,
});

const timeBuf = root.createUniform(d.f32, 0);
const resolutionBuf = root.createUniform(d.vec2f, d.vec2f(canvas.width, canvas.height));
const mousePosBuf = root.createUniform(d.vec2f, d.vec2f(0));

const paramsUniform = root.createUniform(Params, {
  sphereSpacing: 4.0,
  maxDistance: 60.0,
  maxSteps: 96,
  sphereRadius: 0.5,
  waveFreqX: 2.0,
  waveFreqY: 2.0,
  waveAmplitude: 0.2,
  twistFactor: 0.01,
});

function updatePointerPosition(clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  const u = (clientX - r.left) / r.width;
  const v = (clientY - r.top) / r.height;
  const aspect = r.width / r.height;

  const uvX = (u - 0.5) * 2.0 * aspect;
  const uvY = (v - 0.5) * -2.0;

  const worldX = uvX * (7.0 / 3.0);
  const worldY = uvY * (7.0 / 3.0);

  mousePosBuf.write(d.vec2f(worldX, worldY));
}

function onPointerMove(e: PointerEvent) {
  updatePointerPosition(e.clientX, e.clientY);
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length > 0) {
    e.preventDefault();
    updatePointerPosition(e.touches[0].clientX, e.touches[0].clientY);
  }
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length > 0) {
    e.preventDefault();
    updatePointerPosition(e.touches[0].clientX, e.touches[0].clientY);
  }
}

canvas.addEventListener('pointermove', onPointerMove, { signal });
canvas.addEventListener('touchstart', onTouchStart, {
  passive: false,
  signal,
});
canvas.addEventListener('touchmove', onTouchMove, { passive: false, signal });

const palette = (t: number) => {
  'use gpu';
  const a = d.vec3f(0.5, 0.5, 0.5);
  const b = d.vec3f(0.5, 0.5, 0.5);
  const c = d.vec3f(1.0, 1.0, 1.0);
  const dCol = d.vec3f(0.0, 0.33, 0.67);
  return a + b * std.cos((c * t + dCol) * 6.28318);
};

const sdfScene = (p: d.v3f) => {
  'use gpu';
  const time = timeBuf.$;
  const mouse = mousePosBuf.$;
  const params = paramsUniform.$;

  const angle = p.z * params.twistFactor + time * 0.2;
  const c = std.cos(angle);
  const s = std.sin(angle);
  const twistedP = d.vec3f(c * p.x - s * p.y, s * p.x + c * p.y, p.z);

  const spacing = params.sphereSpacing;
  const cell = d.vec3f(
    std.fract(twistedP.x * (1 / spacing) + -mouse.x * 2) * spacing - spacing / 2.0,
    std.fract(twistedP.y * (1 / spacing) + mouse.y * 2) * spacing - spacing / 2.0,
    std.fract(twistedP.z * (1 / spacing)) * spacing - spacing / 2.0,
  );

  const wave =
    std.sin(p.x * params.waveFreqX + time * 5.0) *
    std.cos(p.y * params.waveFreqY + time * 10.0) *
    params.waveAmplitude;
  const sphereDist = std.length(cell) - (params.sphereRadius + 0.15 * std.sin(time * 5.0 + p.z));
  const tunnelCore = 0.697 - std.length(twistedP.xy);
  const dist = std.max(sphereDist + wave, tunnelCore);

  const color = palette(p.z * 0.1 + time * 0.2);

  return d.vec4f(dist, color);
};

const calcNormal = (p: d.v3f) => {
  'use gpu';
  const e = 0.001;
  const dCenter = sdfScene(p).x;
  const nx = sdfScene(p + d.vec3f(e, 0, 0)).x - dCenter;
  const ny = sdfScene(p + d.vec3f(0, e, 0)).x - dCenter;
  const nz = sdfScene(p + d.vec3f(0, 0, e)).x - dCenter;
  return std.normalize(d.vec3f(nx, ny, nz));
};

const fragment = tgpu.fragmentFn({
  in: { position: d.builtin.position },
  out: d.vec4f,
})(({ position }) => {
  'use gpu';

  const time = timeBuf.$;
  const params = paramsUniform.$;
  const res = resolutionBuf.$;
  const aspect = res.x / res.y;
  const uv = d.vec2f((position.x / res.x - 0.5) * 2.0 * aspect, (position.y / res.y - 0.5) * -2.0);

  const ro = d.vec3f(0, 0, time * 3.0);
  const rd = std.normalize(d.vec3f(uv, 2.8));

  let t = d.f32(0);
  let glow = d.f32(0);
  let hit = false;
  let hitP = d.vec3f(0);
  let hitColor = d.vec3f(0);

  const maxSteps = params.maxSteps;
  const maxDist = params.maxDistance;

  for (let i = 0; i < maxSteps; i++) {
    const p = ro + rd * t;
    const sceneHit = sdfScene(p);
    const dist = sceneHit.x;

    glow += 0.015 / (0.01 + std.abs(dist) * std.abs(dist));

    if (dist < 0.001) {
      hit = true;
      hitP = d.vec3f(p);
      hitColor = d.vec3f(sceneHit.yzw);
      break;
    }
    if (t > maxDist) {
      break;
    }
    t += dist;
  }

  if (hit) {
    const normal = calcNormal(hitP);
    const lightDir = std.normalize(d.vec3f(std.sin(time), 1.0, -1.0));
    const halfLambert = std.dot(normal, lightDir) * 0.5 + 0.5;
    const diff = halfLambert * halfLambert;

    const color = hitColor * (diff + 0.3) + palette(time * 0.5) * (glow * 0.05);

    return d.vec4f(color, 1.0);
  }

  const bgColor = palette(uv.x + time * 1.5) * (glow * 0.13);
  return d.vec4f(bgColor, 1.0);
});

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: fragment,
});

let isRunning = true;
let animationFrameId = 0;
let resolutionScale = 1.0;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.floor(canvas.clientWidth * dpr * resolutionScale));
  const targetHeight = Math.max(1, Math.floor(canvas.clientHeight * dpr * resolutionScale));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
}

const resizeObserver = new ResizeObserver(() => resizeCanvas());
resizeObserver.observe(canvas);
resizeCanvas();

function frame(timestamp: number) {
  if (!isRunning) {
    return;
  }

  timeBuf.write(timestamp / 1000);
  resolutionBuf.write(d.vec2f(canvas.width, canvas.height));
  const view = context.getCurrentTexture().createView();

  pipeline.withColorAttachment({ view }).draw(3);
  animationFrameId = requestAnimationFrame(frame);
}

animationFrameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = defineControls({
  'Resolution scale': {
    initial: 1.0,
    min: 0.1,
    max: 1.0,
    step: 0.05,
    onSliderChange: (value) => {
      resolutionScale = value;
      resizeCanvas();
    },
  },
  'Sphere spacing': {
    initial: 4.0,
    min: 1.0,
    max: 10.0,
    step: 0.1,
    onSliderChange: (value) => {
      paramsUniform.patch({ sphereSpacing: value });
    },
  },
  'Max distance': {
    initial: 60.0,
    min: 10.0,
    max: 250.0,
    step: 1.0,
    onSliderChange: (value) => {
      paramsUniform.patch({ maxDistance: value });
    },
  },
  'Raymarching steps': {
    initial: 96,
    min: 10,
    max: 256,
    step: 1,
    onSliderChange: (value) => {
      paramsUniform.patch({ maxSteps: value });
    },
  },
  'Sphere base radius': {
    initial: 0.5,
    min: 0.0,
    max: 1.5,
    step: 0.01,
    onSliderChange: (value) => {
      paramsUniform.patch({ sphereRadius: value });
    },
  },
  'Wave frequency x': {
    initial: 2.0,
    min: 0.0,
    max: 100.0,
    step: 0.1,
    onSliderChange: (value) => {
      paramsUniform.patch({ waveFreqX: value });
    },
  },
  'Wave frequency y': {
    initial: 2.0,
    min: 0.0,
    max: 100.0,
    step: 0.1,
    onSliderChange: (value) => {
      paramsUniform.patch({ waveFreqY: value });
    },
  },
  'Wave amplitude': {
    initial: 0.2,
    min: 0.0,
    max: 2.5,
    step: 0.01,
    onSliderChange: (value) => {
      paramsUniform.patch({ waveAmplitude: value });
    },
  },
  'Twist factor': {
    initial: 0.01,
    min: 0.0,
    max: 0.5,
    step: 0.001,
    onSliderChange: (value) => {
      paramsUniform.patch({ twistFactor: value });
    },
  },
});

export function onCleanup() {
  isRunning = false;
  cancelAnimationFrame(animationFrameId);
  resizeObserver.disconnect();
  cleanupController.abort();
  root.destroy();
}

// #endregion
