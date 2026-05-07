import { randf, randomGeneratorSlot } from '@typegpu/noise';
import tgpu, { common, d, std, type TgpuGuardedComputePipeline } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';

import { initialPRNG, prngKeys, prngs, type PRNGKey } from './prngs.ts';
import { defineControls } from '../../common/defineControls.ts';

type Mode = '2d' | '3d';

const modes: Mode[] = ['2d', '3d'];
const initialOpacityPerStep = 0.02;
const gridSizes = [8, 16, 32, 64, 128];
const initialGridSize = gridSizes[2];
const samplesPerThread = [1, 8, 16, 64, 256, 1024, 131072];
const initialSamplesPerThread = samplesPerThread[0];
const initialTakeAverage = false;

const root = await tgpu.init({ device: { requiredFeatures: ['timestamp-query'] } });

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const Config = d.struct({
  gridSize: d.f32,
  canvasRatio: d.f32,
  samplesPerThread: d.i32,
  takeAverage: d.i32,
  opacityPerStep: d.f32,
});

const configUniform = root.createUniform(Config, {
  gridSize: initialGridSize,
  canvasRatio: canvas.width / canvas.height,
  samplesPerThread: initialSamplesPerThread,
  takeAverage: d.i32(initialTakeAverage),
  opacityPerStep: initialOpacityPerStep,
});

const layouts2d = {
  compute: tgpu.bindGroupLayout({
    texture: { storageTexture: d.textureStorage2d('r32float', 'write-only') },
  }),
  display: tgpu.bindGroupLayout({
    texture: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
  }),
};

const bindGroups2d = Object.fromEntries(
  gridSizes.map((size) => {
    const texture = root
      .createTexture({ size: [size, size], format: 'r32float' })
      .$usage('storage', 'sampled');
    return [
      size,
      {
        compute: root.createBindGroup(layouts2d.compute, { texture }),
        display: root.createBindGroup(layouts2d.display, { texture }),
      },
    ];
  }),
);

const displayPipeline2d = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const adjustedUv = uv * d.vec2f(configUniform.$.canvasRatio, 1);
    const gridSize = configUniform.$.gridSize;
    const coords = d.vec2u(std.floor(adjustedUv * gridSize));
    const value = std.textureLoad(layouts2d.display.$.texture, coords).r;
    return d.vec4f(d.vec3f(value), 1);
  },
  targets: { format: presentationFormat },
});

const computeFn2d = (x: number, y: number) => {
  'use gpu';
  randf.seed2(d.vec2f(x, y) - configUniform.$.gridSize / 2);

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

  std.textureStore(layouts2d.compute.$.texture, d.vec2u(x, y), d.vec4f(result, 0, 0, 0));
};

const cameraUniform = root.createUniform(Camera);

const RayBoxResult = d.struct({ tNear: d.f32, tFar: d.f32, hit: d.bool });

const rayBoxIntersection = (rayOrigin: d.v3f, rayDir: d.v3f, boxMin: d.v3f, boxMax: d.v3f) => {
  'use gpu';
  const invDir = d.vec3f(1) / rayDir;
  const t0 = (boxMin - rayOrigin) * invDir;
  const t1 = (boxMax - rayOrigin) * invDir;
  const tmin = std.min(t0, t1);
  const tmax = std.max(t0, t1);
  const tNear = std.max(tmin.x, tmin.y, tmin.z);
  const tFar = std.min(tmax.x, tmax.y, tmax.z);
  return RayBoxResult({ tNear, tFar, hit: tFar >= tNear && tFar >= d.f32(0) });
};

const displayPipeline3d = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const ndc = d.vec2f(uv.x * 2 - 1, 1 - uv.y * 2);
    const invViewProj = cameraUniform.$.viewInverse * cameraUniform.$.projectionInverse;
    const worldNear = invViewProj * d.vec4f(ndc, -1, 1);
    const worldFar = invViewProj * d.vec4f(ndc, 1, 1);
    const rayOrigin = worldNear.xyz / worldNear.w;
    const rayDir = std.normalize(worldFar.xyz / worldFar.w - rayOrigin);

    const gridSize = configUniform.$.gridSize;
    const boxMax = d.vec3f(gridSize);
    const isect = rayBoxIntersection(rayOrigin, rayDir, d.vec3f(0), boxMax);
    if (!isect.hit) return d.vec4f(0);

    const stepSize = (isect.tFar - isect.tNear) / d.f32(64);
    let transmittance = d.f32(1);
    let accum = d.vec3f();

    let i = d.i32(0);
    while (i < 64 && transmittance > 1e-3) {
      const t = isect.tNear + (d.f32(i) + 0.5) * stepSize;
      const pos = rayOrigin + rayDir * t;
      const ipos = d.vec3u(std.clamp(pos, d.vec3f(0), boxMax - d.vec3f(1)));
      const value = std.textureLoad(layouts3d.display.$.texture, ipos).r;

      const opacity = configUniform.$.opacityPerStep;
      accum += d.vec3f(value) * opacity * transmittance;
      transmittance *= d.f32(1) - opacity;
      i += 1;
    }

    return d.vec4f(accum, 1 - transmittance);
  },
  targets: { format: presentationFormat },
});

const computeFn3d = (x: number, y: number, z: number) => {
  'use gpu';
  randf.seed3(d.vec3f(x, y, z) - configUniform.$.gridSize / 2);

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

  std.textureStore(layouts3d.compute.$.texture, d.vec3u(x, y, z), d.vec4f(result, 0, 0, 0));
};

type ModeToComputePipeline = {
  '2d': TgpuGuardedComputePipeline<[number, number]>;
  '3d': TgpuGuardedComputePipeline<[number, number, number]>;
};

const pipelineCache: { [TMode in Mode]: Map<PRNGKey, ModeToComputePipeline[TMode]> } = {
  '2d': new Map<PRNGKey, ModeToComputePipeline['2d']>(),
  '3d': new Map<PRNGKey, ModeToComputePipeline['3d']>(),
};

const createPipeline: { [TMode in Mode]: (key: PRNGKey) => ModeToComputePipeline[TMode] } = {
  '2d': (key) =>
    root
      .with(randomGeneratorSlot, prngs[key].generator)
      .createGuardedComputePipeline(computeFn2d)
      .withPerformanceCallback((start, end) => {
        console.log(`[${key} 2d] ${Number(end - start) / 1_000_000} ms`);
      }),
  '3d': (key) =>
    root
      .with(randomGeneratorSlot, prngs[key].generator)
      .createGuardedComputePipeline(computeFn3d)
      .withPerformanceCallback((start, end) => {
        console.log(`[${key} 3d] ${Number(end - start) / 1_000_000} ms`);
      }),
};

const getPipeline = <TMode extends Mode>(
  mode: TMode,
  key: PRNGKey,
): ModeToComputePipeline[TMode] => {
  const cache = pipelineCache[mode];

  return (
    cache.get(key) ??
    (() => {
      const pipeline = createPipeline[mode](key);
      cache.set(key, pipeline);
      return pipeline;
    })()
  );
};

const layouts = {
  '2d': {
    compute: layouts2d.compute,
    display: layouts2d.display,
  },
  '3d': {
    compute: layouts3d.compute,
    display: layouts3d.display,
  },
};

let mode: Mode = '3d';
let prng = initialPRNG;
let gridSize = initialGridSize;

const resample = () => {
  configUniform.patch({ gridSize });

  if (mode === '2d') {
    getPipeline(mode, prng)
      .with(bindGroups2d[gridSize].compute)
      .dispatchThreads(gridSize, gridSize);
  } else {
    getPipeline(mode, prng)
      .with(bindGroups3d[gridSize].compute)
      .dispatchThreads(gridSize, gridSize, gridSize);
  }
};

const redraw = () => {
  if (mode === '2d') {
    displayPipeline2d
      .withColorAttachment({ view: context })
      .with(bindGroups2d[gridSize].display)
      .draw(3);
  } else {
    displayPipeline3d
      .withColorAttachment({ view: context })
      .with(bindGroups3d[gridSize].display)
      .draw(3);
  }
};

// #region Controls & cleanup

const { cleanupCamera, targetCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(d.vec3f(2 * gridSize), 1),
    target: d.vec4f(d.vec3f(0.5 * gridSize), 1),
    minZoom: 10,
    maxZoom: 300,
  },
  (updates) => {
    if (mode === '2d') {
      configUniform.patch({ canvasRatio: canvas.width / canvas.height });
    } else {
      cameraUniform.patch(updates);
    }
    redraw();
  },
);

export const controls = defineControls({
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
    initial: initialPRNG,
    options: prngKeys,
    onSelectChange: (value) => {
      prng = value;
      resample();
      redraw();
    },
  },
  'Grid Size': {
    initial: initialGridSize,
    options: gridSizes,
    onSelectChange: (value) => {
      gridSize = value;
      targetCamera(d.vec4f(d.vec3f(2 * value), 1), d.vec4f(d.vec3f(0.5 * value), 1));
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
  'Opacity per step': {
    initial: initialOpacityPerStep,
    min: 0.001,
    max: 0.1,
    step: 0.001,
    onSliderChange: (value) => {
      configUniform.patch({ opacityPerStep: value });
      redraw();
    },
  },
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick: () => {
      prngKeys.forEach((key) => {
        root.device.createShaderModule({ code: tgpu.resolve([getPipeline('2d', key).pipeline]) });
        root.device.createShaderModule({ code: tgpu.resolve([getPipeline('3d', key).pipeline]) });
      });
    },
  },
});

export function onCleanup() {
  cleanupCamera();
  root.destroy();
}

// #endregion
