import { tgpu, d, std, common } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const cleanupController = new AbortController();
const { signal } = cleanupController;

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

const timeUniform = root.createUniform(d.f32);
const aspectRatioUniform = root.createUniform(d.f32, canvas.width / canvas.height);
const mousePosUniform = root.createUniform(d.vec2f);

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
  if (r.width === 0 || r.height === 0) {
    return;
  }
  const u = (clientX - r.left) / r.width;
  const v = (clientY - r.top) / r.height;
  const aspect = r.width / r.height;

  const uvX = (u - 0.5) * 2.0 * aspect;
  const uvY = (v - 0.5) * -2.0;

  const worldX = uvX * (7.0 / 3.0);
  const worldY = uvY * (7.0 / 3.0);

  mousePosUniform.write([worldX, worldY]);
}

function onPointerMove(e: PointerEvent) {
  updatePointerPosition(e.clientX, e.clientY);
}

canvas.addEventListener('pointermove', onPointerMove, { signal });

// https://iquilezles.org/articles/palettes/
const palette = (t: number) => {
  'use gpu';
  const a = d.vec3f(0.5);
  const dCol = d.vec3f(0.0, 0.33, 0.67);
  return a + a * std.cos((a * 2 * t + dCol) * Math.PI * 2);
};

const sdfScene = (p: d.v3f) => {
  'use gpu';
  const time = timeUniform.$;
  const mouse = mousePosUniform.$;
  const params = paramsUniform.$;

  const angle = p.z * params.twistFactor + time * 0.2;
  const c = std.cos(angle);
  const s = std.sin(angle);
  const twistedP = d.vec3f(c * p.x - s * p.y, s * p.x + c * p.y, p.z);

  const spacing = params.sphereSpacing;
  const scroll = d.vec3f(-mouse.x, mouse.y, 0) * 2;
  const cell = (std.fract(twistedP / spacing + scroll) - 0.5) * spacing;

  const wave =
    std.sin(p.x * params.waveFreqX + time * 5.0) *
    std.cos(p.y * params.waveFreqY + time * 10.0) *
    params.waveAmplitude;
  const sphereDist = std.length(cell) - (params.sphereRadius + 0.15 * std.sin(time * 5.0 + p.z));
  const tunnelCore = 0.697 - std.length(twistedP.xy);
  return std.max(sphereDist + wave, tunnelCore);
};

const calcNormal = (p: d.v3f) => {
  'use gpu';
  const e = 0.001;
  const dCenter = sdfScene(p);
  const nx = sdfScene(p + d.vec3f(e, 0, 0)) - dCenter;
  const ny = sdfScene(p + d.vec3f(0, e, 0)) - dCenter;
  const nz = sdfScene(p + d.vec3f(0, 0, e)) - dCenter;
  return std.normalize(d.vec3f(nx, ny, nz));
};

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv: rawUv }) => {
  'use gpu';

  const time = timeUniform.$;
  const params = paramsUniform.$;
  const aspect = aspectRatioUniform.$;
  const uv = d.vec2f((rawUv.x - 0.5) * 2.0 * aspect, (rawUv.y - 0.5) * -2.0);

  const ro = d.vec3f(0, 0, time * 3.0);
  const rd = std.normalize(d.vec3f(uv, 2.8));

  let t = d.f32(0);
  let glow = d.f32(0);
  let hit = false;

  const maxSteps = params.maxSteps;
  const maxDist = params.maxDistance;

  for (let i = 0; i < maxSteps; i++) {
    const p = ro + rd * t;
    const dist = sdfScene(p);

    glow += 0.015 / (0.01 + std.abs(dist) * std.abs(dist));

    if (dist < 0.001) {
      hit = true;
      break;
    }
    if (t > maxDist) {
      break;
    }
    t += dist;
  }

  if (hit) {
    const hitP = ro + rd * t;
    const hitColor = palette(hitP.z * 0.1 + time * 0.2);
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
    aspectRatioUniform.write(targetWidth / targetHeight);
  }
}

const resizeObserver = new ResizeObserver(() => resizeCanvas());
resizeObserver.observe(canvas);
resizeCanvas();

function frame(timestamp: number) {
  if (!isRunning) {
    return;
  }

  timeUniform.write(timestamp / 1000);
  const view = context.getCurrentTexture().createView();

  pipeline.withColorAttachment({ view }).draw(3);
  animationFrameId = requestAnimationFrame(frame);
}

animationFrameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

const paramSlider = (
  key: keyof typeof Params.propTypes,
  opts: { initial: number; min: number; max: number; step: number },
) => ({
  ...opts,
  onSliderChange: (value: number) => {
    paramsUniform.patch({ [key]: value });
  },
});

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
  'Sphere spacing': paramSlider('sphereSpacing', { initial: 4, min: 1, max: 10, step: 0.1 }),
  'Max distance': paramSlider('maxDistance', { initial: 60, min: 10, max: 250, step: 1 }),
  'Raymarching steps': paramSlider('maxSteps', { initial: 96, min: 10, max: 256, step: 1 }),
  'Sphere base radius': paramSlider('sphereRadius', { initial: 0.5, min: 0, max: 1.5, step: 0.01 }),
  'Wave frequency x': paramSlider('waveFreqX', { initial: 2, min: 0, max: 100, step: 0.1 }),
  'Wave frequency y': paramSlider('waveFreqY', { initial: 2, min: 0, max: 100, step: 0.1 }),
  'Wave amplitude': paramSlider('waveAmplitude', { initial: 0.2, min: 0, max: 2.5, step: 0.01 }),
  'Twist factor': paramSlider('twistFactor', { initial: 0.01, min: 0, max: 0.5, step: 0.001 }),
});

export function onCleanup() {
  isRunning = false;
  cancelAnimationFrame(animationFrameId);
  resizeObserver.disconnect();
  cleanupController.abort();
  root.destroy();
}

// #endregion
