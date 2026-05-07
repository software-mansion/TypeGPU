import { randf, randomGeneratorSlot } from '@typegpu/noise';
import tgpu, { common, d, std, type TgpuGuardedComputePipeline } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';

import { prngKeys, prngs, type PRNGKey } from './prngs.ts';
import { defineControls } from '../../common/defineControls.ts';

type Mode = '2d' | '3d';

const modes: Mode[] = ['2d', '3d'];
const initialOpacityPerStep = 0.02;
const gridSizes = [8, 16, 32, 64, 128, 256];
const samplesPerThread = [1, 8, 16, 64, 256, 1024, 131072];
const initialSamplesPerThread = samplesPerThread[0];
const initialTakeAverage = false;
let multiplier = 1;

let mode = '2d' as Mode;
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
  opacityPerStep: d.f32,
  canvasRatio: d.f32,
});

const configUniform = root.createUniform(Config, {
  gridSize,
  samplesPerThread: initialSamplesPerThread,
  takeAverage: d.i32(initialTakeAverage),
  opacityPerStep: initialOpacityPerStep,
  multiplier,
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
// HERE

const displayPipelines = {
  '2d': displayPipeline2d,
  '3d': displayPipeline2d,
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
    initial: multiplier,
    min: 0.0001,
    max: 1000,
    step: 1,
    onSliderChange: (value) => {
      configUniform.patch({ multiplier: value });
      resample();
      redraw();
    },
  },
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick: () => {
      modes.forEach((mode) => {
        prngKeys.forEach((key) => {
          // don't care about display pipelines
          root.device.createShaderModule({
            code: tgpu.resolve([getComputePipeline(mode, key).pipeline]),
          });
        });
      });
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
