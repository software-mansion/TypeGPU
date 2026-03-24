import { randf, randomGeneratorSlot } from '@typegpu/noise';
import tgpu, { common, d, std, type TgpuGuardedComputePipeline } from 'typegpu';

import * as c from './constants.ts';
import { initialPRNG, prngKeys, prngs, type PRNGKey } from './prngs.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init({ device: { requiredFeatures: ['timestamp-query'] } });

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const Config = d.struct({
  gridSize: d.f32,
  canvasRatio: d.f32,
  useSeed2: d.u32,
  samplesPerThread: d.u32,
  takeAverage: d.u32,
});

const configUniform = root.createUniform(Config, {
  gridSize: c.initialGridSize,
  canvasRatio: canvas.width / canvas.height,
  useSeed2: d.u32(prngs[initialPRNG].useSeed2),
  samplesPerThread: c.initialSamplesPerThread,
  takeAverage: d.u32(c.initialTakeAverage),
});

const layouts = {
  compute: tgpu.bindGroupLayout({
    texture: { storageTexture: d.textureStorage2d('r32float', 'write-only') },
  }),
  display: tgpu.bindGroupLayout({
    texture: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
  }),
};

const bindGroups = Object.fromEntries(
  c.gridSizes.map((size) => {
    const texture = root['~unstable']
      .createTexture({ size: [size, size], format: 'r32float' })
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

const displayPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const adjustedUv = uv * d.vec2f(configUniform.$.canvasRatio, 1);
    const gridSize = configUniform.$.gridSize;
    const coords = d.vec2u(std.floor(adjustedUv * gridSize));
    const value = std.textureLoad(layouts.display.$.texture, coords).r;
    return d.vec4f(d.vec3f(value), 1);
  },
  targets: { format: presentationFormat },
});

const computeFn = (x: number, y: number) => {
  'use gpu';
  const gridSize = configUniform.$.gridSize;

  if (configUniform.$.useSeed2 === 1) {
    randf.seed2(d.vec2f(x, y));
  } else {
    randf.seed(d.f32(x) * gridSize + d.f32(y));
  }

  let i = d.u32(0);
  const samplesPerThread = configUniform.$.samplesPerThread;
  let samples = d.f32(0);
  while (i < samplesPerThread - 1) {
    samples += randf.sample();
    i += 1;
  }

  let result = randf.sample();
  if (configUniform.$.takeAverage === 1) {
    result = (result + samples) / samplesPerThread;
  }

  std.textureStore(layouts.compute.$.texture, d.vec2u(x, y), d.vec4f(result, 0, 0, 0));
};

const computePipelineCache = new Map<PRNGKey, TgpuGuardedComputePipeline<[number, number]>>();
const getComputePipeline = (key: PRNGKey) => {
  let pipeline = computePipelineCache.get(key);
  if (!pipeline) {
    pipeline = root
      .with(randomGeneratorSlot, prngs[key].generator)
      .createGuardedComputePipeline(computeFn)
      .withPerformanceCallback((start, end) => {
        console.log(`[${key}] - ${Number(end - start) / 1000} ms.`);
      });
    computePipelineCache.set(key, pipeline);
  }
  return pipeline;
};

let prng = initialPRNG;
let gridSize = c.initialGridSize;

const redraw = () => {
  getComputePipeline(prng).with(bindGroups[gridSize].compute).dispatchThreads(gridSize, gridSize);
  displayPipeline.withColorAttachment({ view: context }).with(bindGroups[gridSize].display).draw(3);
};

// #region Example controls & Cleanup
export const controls = defineControls({
  PRNG: {
    initial: initialPRNG,
    options: prngKeys,
    onSelectChange: (value) => {
      prng = value;
      configUniform.writePartial({ useSeed2: d.u32(prngs[value].useSeed2) });
      redraw();
    },
  },
  'Samples per thread': {
    initial: c.initialSamplesPerThread,
    options: c.samplesPerThread,
    onSelectChange: (value) => {
      configUniform.writePartial({ samplesPerThread: value });
      redraw();
    },
  },
  'Take Average': {
    initial: c.initialTakeAverage,
    onToggleChange: (value) => {
      configUniform.writePartial({ takeAverage: d.u32(value) });
      redraw();
    },
  },
  'Grid Size': {
    initial: c.initialGridSize,
    options: c.gridSizes,
    onSelectChange: (value) => {
      gridSize = value;
      configUniform.writePartial({ gridSize });
      redraw();
    },
  },
  // this is the only place where some niche prngs are tested
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick: () => {
      prngKeys
        .map((key) => tgpu.resolve([getComputePipeline(key).pipeline]))
        .forEach((r) => root.device.createShaderModule({ code: r }));
    },
  },
});

const resizeObserver = new ResizeObserver(() => {
  configUniform.writePartial({ canvasRatio: canvas.width / canvas.height });
  redraw();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
