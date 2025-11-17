import { randf, randomGeneratorSlot } from '@typegpu/noise';
import { tgpu, common, d, std, type TgpuGuardedComputePipeline } from 'typegpu';

import { defineControls } from '../../common/defineControls.ts';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { prngKeys, prngs, type PRNGKey } from './prngs.ts';

type Mode = '2d' | '3d';

const modes: Mode[] = ['2d', '3d'];
const gridSizes = [8, 16, 32, 64, 128, 256];
const samplesPerThread = [1, 8, 16, 64, 256, 1024, 131072];
const initialSamplesPerThread = samplesPerThread[0];
const initialTakeAverage = false;
const initialMultiplier = 1;

let mode = modes[1];
let prng = prngKeys[0];
let gridSize = gridSizes[2];

const root = await tgpu.init({ device: { requiredFeatures: ['timestamp-query'] } });

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const Config = d.struct({
  gridSize: d.f32,
  samplesPerThread: d.i32,
  takeAverage: d.i32,
  multiplier: d.f32,
  canvasRatio: d.f32,
});

const configUniform = root.createUniform(Config, {
  gridSize,
  samplesPerThread: initialSamplesPerThread,
  takeAverage: d.i32(initialTakeAverage),
  multiplier: initialMultiplier,
  canvasRatio: canvas.width / canvas.height,
});

const layouts = {
  compute: tgpu.bindGroupLayout({
    texture: { storageTexture: d.textureStorage3d('r32float', 'write-only') },
  }),
  display: tgpu.bindGroupLayout({
    texture: { storageTexture: d.textureStorage3d('r32float', 'read-only') },
  }),
};

const bindGroups = Object.fromEntries(
  gridSizes.map((size) => {
    const texture = root
      .createTexture({ size: [size, size, size], format: 'r32float', dimension: '3d' })
      .$usage('storage', 'sampled');
    return [
      size,
      {
        compute: root.createBindGroup(layouts.compute, { texture }),
        display: root.createBindGroup(layouts.display, { texture }),
      },
    ];
  }),
);

const modeSlot = tgpu.slot<number>();
const computeFn = tgpu.fn((x: number, y: number, z: number) => {
  'use gpu';
  const multiplier = configUniform.$.multiplier;
  modeSlot.$ === 1
    ? randf.seed3((d.vec3f(x, y, z) - configUniform.$.gridSize / 2) * multiplier)
    : randf.seed2((d.vec2f(x, y) - configUniform.$.gridSize / 2) * multiplier);

  const samplesPerThread = configUniform.$.samplesPerThread;
  const takeAverage = configUniform.$.takeAverage;

  let sum = d.f32(0);
  for (let i = d.i32(0); i < samplesPerThread - 1; i++) {
    sum += randf.sample();
  }

  let result = randf.sample();
  result += sum * d.f32(takeAverage);
  const denominator = d.f32(1 + (samplesPerThread - 1) * takeAverage);
  result /= denominator;

  std.textureStore(layouts.compute.$.texture, d.vec3u(x, y, z), d.vec4f(result, 0, 0, 0));
});

const computeFns = {
  '2d': computeFn.with(modeSlot, 0),
  '3d': computeFn.with(modeSlot, 1),
};

const computePipelineCache = {
  '2d': new Map<PRNGKey, TgpuGuardedComputePipeline<[number, number, number]>>(),
  '3d': new Map<PRNGKey, TgpuGuardedComputePipeline<[number, number, number]>>(),
};

const getComputePipeline = (mode: Mode, key: PRNGKey) => {
  const cache = computePipelineCache[mode];

  let p = cache.get(key);
  if (!p) {
    p = root
      .with(randomGeneratorSlot, prngs[key].generator)
      .createGuardedComputePipeline(computeFns[mode])
      .withPerformanceCallback((start, end) => {
        console.log(`[${key} ${mode}] ${Number(end - start) / 1_000_000} ms`);
      });
    cache.set(key, p);
  }
  return p;
};

const displayPipeline2d = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const adjustedUv = uv * d.vec2f(configUniform.$.canvasRatio, 1);
    const gridSize = configUniform.$.gridSize;
    const coords = d.vec2u(std.floor(adjustedUv * gridSize));
    const value = std.textureLoad(layouts.display.$.texture, d.vec3u(coords, 0)).r;
    return d.vec4f(d.vec3f(value), 1);
  },
  targets: { format: presentationFormat },
});

const cameraUniform = root.createUniform(Camera);
const BoxIntersection = d.struct({ tNear: d.f32, tFar: d.f32, hit: d.bool });

// based on: https://www.scratchapixel.com/lessons/3d-basic-rendering/minimal-ray-tracer-rendering-simple-shapes/ray-box-intersection.html
const getBoxIntersection = (rayOrigin: d.v3f, rayDir: d.v3f, boxMin: d.v3f, boxMax: d.v3f) => {
  'use gpu';
  const invDir = 1 / rayDir;
  const t0 = (boxMin - rayOrigin) * invDir;
  const t1 = (boxMax - rayOrigin) * invDir;
  const tmin = std.min(t0, t1);
  const tmax = std.max(t0, t1);
  const tNear = std.max(tmin.x, tmin.y, tmin.z);
  const tFar = std.min(tmax.x, tmax.y, tmax.z);
  return BoxIntersection({ tNear, tFar, hit: tFar >= tNear });
};

const STEPS = 64;
const displayPipeline3d = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const ndc = d.vec2f(uv.x * 2 - 1, 1 - uv.y * 2);
    const invViewProj = cameraUniform.$.viewInverse * cameraUniform.$.projectionInverse;
    const worldNear = invViewProj * d.vec4f(ndc, 0, 1);
    const worldFar = invViewProj * d.vec4f(ndc, 1, 1);
    const rayOrigin = worldNear.xyz / worldNear.w;
    const rayDir = std.normalize(worldFar.xyz / worldFar.w - rayOrigin);

    const gridSize = configUniform.$.gridSize;
    const boxMax = d.vec3f(gridSize);
    const isect = getBoxIntersection(rayOrigin, rayDir, d.vec3f(0), boxMax);
    if (!isect.hit) {
      return d.vec4f();
    }

    const stepSize = (isect.tFar - isect.tNear) / STEPS;
    const opacity = (stepSize / gridSize) * 3;
    let transmittance = d.f32(1);
    let accum = d.f32();
    let i = 0;
    while (i < STEPS && transmittance > 1e-3) {
      const t = isect.tNear + (d.f32(i) + 0.5) * stepSize;
      const pos = rayOrigin + rayDir * t;
      const value = std.textureLoad(
        layouts.display.$.texture,
        d.vec3u(std.clamp(pos, d.vec3f(0), boxMax - 1)),
      ).r;
      accum += value * opacity * transmittance;
      transmittance *= 1 - opacity;
      i += 1;
    }

    return d.vec4f(d.vec3f(accum), 1 - transmittance);
  },
  targets: { format: presentationFormat },
});

const displayPipelines = {
  '2d': displayPipeline2d,
  '3d': displayPipeline3d,
};

const resample = () => {
  configUniform.patch({ gridSize });

  getComputePipeline(mode, prng)
    .with(bindGroups[gridSize].compute)
    .dispatchThreads(gridSize, gridSize, mode === '3d' ? gridSize : 1);
};

const redraw = () => {
  displayPipelines[mode]
    .withColorAttachment({ view: context })
    .with(bindGroups[gridSize].display)
    .draw(3);
};

const { cleanupCamera, targetCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(d.vec3f(2 * gridSize), 1),
    target: d.vec4f(d.vec3f(0.5 * gridSize), 1),
    minZoom: 10,
    maxZoom: 1000,
  },
  (updates) => {
    cameraUniform.patch(updates);
    redraw();
  },
);

export const controls = defineControls({
  Run: {
    onButtonClick: () => {
      resample();
      redraw();
    },
  },
  Mode: {
    initial: mode,
    options: modes,
    onSelectChange: (value) => {
      mode = value;
      resample();
      redraw();
    },
  },
  PRNG: {
    initial: prng,
    options: prngKeys,
    onSelectChange: (value) => {
      prng = value;
      resample();
      redraw();
    },
  },
  'Grid Size': {
    initial: gridSize,
    options: gridSizes,
    onSelectChange: (value) => {
      gridSize = value;
      targetCamera(d.vec4f(d.vec3f(2 * gridSize), 1), d.vec4f(d.vec3f(0.5 * gridSize), 1));
      resample();
      redraw();
    },
  },
  'Samples per thread': {
    initial: initialSamplesPerThread,
    options: samplesPerThread,
    onSelectChange: (value) => {
      configUniform.patch({ samplesPerThread: value });
      resample();
      redraw();
    },
  },
  'Take Average': {
    initial: initialTakeAverage,
    onToggleChange: (value) => {
      configUniform.patch({ takeAverage: d.i32(value) });
      resample();
      redraw();
    },
  },
  'Seed Multiplier': {
    initial: initialMultiplier,
    min: 0.00001,
    max: 2000,
    step: 1,
    onSliderChange: (value) => {
      configUniform.patch({ multiplier: value });
      resample();
      redraw();
    },
  },
  // this is the only place where some niche prngs are tested
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick: () => {
      prngKeys.forEach((key) => {
        // don't care about display pipelines
        root.device.createShaderModule({
          code: tgpu.resolve([getComputePipeline('2d', key).pipeline]),
        });
      });
    },
  },
});

export function onCleanup() {
  cleanupCamera();
  root.destroy();
}

// #endregion
