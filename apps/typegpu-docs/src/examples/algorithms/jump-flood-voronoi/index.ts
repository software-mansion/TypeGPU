import { randf } from '@typegpu/noise';
import tgpu, { common, d, std } from 'typegpu';
import type { SampledFlag, StorageFlag, TgpuTexture } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const context = root.configureContext({ canvas });

let stepDelayMs = 50;
let seedThreshold = 0.999;
let startingRangePercent = 1;
let currentRunId = 0;
let sourceIdx = 0;

const palette = tgpu.const(d.arrayOf(d.vec3f, 4), [
  d.vec3f(0xeb / 255, 0xcf / 255, 0xff / 255),
  d.vec3f(0xb7 / 255, 0x8b / 255, 0xfa / 255),
  d.vec3f(0x8b / 255, 0x5c / 255, 0xf6 / 255),
  d.vec3f(0x6d / 255, 0x44 / 255, 0xf2 / 255),
]);

const seedThresholdUniform = root.createUniform(d.f32, seedThreshold);
const timeUniform = root.createUniform(d.f32, 0);
const offsetUniform = root.createUniform(d.i32);

const SampleResult = d.struct({
  color: d.vec4f,
  coord: d.vec2f,
});

const initLayout = tgpu.bindGroupLayout({
  writeView: {
    storageTexture: d.textureStorage2dArray('rgba16float', 'write-only'),
  },
});

const pingPongLayout = tgpu.bindGroupLayout({
  writeView: {
    storageTexture: d.textureStorage2dArray('rgba16float', 'write-only'),
  },
  readView: {
    storageTexture: d.textureStorage2dArray('rgba16float', 'read-only'),
  },
});

const colorSampleLayout = tgpu.bindGroupLayout({
  floodTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

type FloodTexture = TgpuTexture<{ size: [number, number, 2]; format: 'rgba16float' }> &
  SampledFlag &
  StorageFlag;

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

function createResources() {
  const textures = [0, 1].map(() =>
    root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height, 2],
        format: 'rgba16float',
      })
      .$usage('sampled', 'storage'),
  ) as [FloodTexture, FloodTexture];

  const initBindGroups = textures.map((tex) =>
    root.createBindGroup(initLayout, { writeView: tex }),
  );

  const pingPongBindGroups = [0, 1].map((i) =>
    root.createBindGroup(pingPongLayout, {
      readView: textures[i],
      writeView: textures[1 - i],
    }),
  );

  const renderBindGroups = textures.map((tex) =>
    root.createBindGroup(colorSampleLayout, {
      floodTexture: tex.createView(d.texture2d(), {
        baseArrayLayer: 0,
        arrayLayerCount: 1,
      }),
      sampler: filteringSampler,
    }),
  );

  return { textures, initBindGroups, pingPongBindGroups, renderBindGroups };
}

let resources = createResources();

const initializeRandom = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const size = std.textureDimensions(initLayout.$.writeView);
  randf.seed2(d.vec2f(x, y).div(d.vec2f(size)).add(timeUniform.$));

  const randomVal = randf.sample();
  const isSeed = randomVal >= seedThresholdUniform.$;

  const paletteColor = palette.$[d.u32(std.floor(randf.sample() * 4))];
  const variation = d
    .vec3f(randf.sample() - 0.5, randf.sample() - 0.5, randf.sample() - 0.5)
    .mul(0.15);

  const color = std.select(
    d.vec4f(),
    d.vec4f(std.saturate(paletteColor.add(variation)), 1),
    isSeed,
  );
  const coord = std.select(d.vec2f(-1), d.vec2f(x, y).div(d.vec2f(size)), isSeed);

  std.textureStore(initLayout.$.writeView, d.vec2i(x, y), 0, color);
  std.textureStore(initLayout.$.writeView, d.vec2i(x, y), 1, d.vec4f(coord, 0, 0));
});

const sampleWithOffset = (
  tex: d.textureStorage2dArray<'rgba16float', 'read-only'>,
  pos: d.v2i,
  offset: d.v2i,
) => {
  'use gpu';
  const dims = std.textureDimensions(tex);
  const samplePos = pos.add(offset);

  const outOfBounds =
    samplePos.x < 0 ||
    samplePos.y < 0 ||
    samplePos.x >= d.i32(dims.x) ||
    samplePos.y >= d.i32(dims.y);

  const safePos = std.clamp(samplePos, d.vec2i(0), d.vec2i(dims.sub(1)));
  const loadedColor = std.textureLoad(tex, safePos, 0);
  const loadedCoord = std.textureLoad(tex, safePos, 1).xy;

  return SampleResult({
    color: std.select(loadedColor, d.vec4f(), outOfBounds),
    coord: std.select(loadedCoord, d.vec2f(-1), outOfBounds),
  });
};

const jumpFlood = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const offset = offsetUniform.$;
  const size = std.textureDimensions(pingPongLayout.$.readView);

  let minDist = 1e20;
  let bestSample = SampleResult({ color: d.vec4f(), coord: d.vec2f(-1) });

  for (const dy of tgpu.unroll([-1, 0, 1])) {
    for (const dx of tgpu.unroll([-1, 0, 1])) {
      const sample = sampleWithOffset(
        pingPongLayout.$.readView,
        d.vec2i(x, y),
        d.vec2i(dx * offset, dy * offset),
      );

      if (sample.coord.x >= 0) {
        const dist = std.distance(d.vec2f(x, y), sample.coord.mul(d.vec2f(size)));
        if (dist < minDist) {
          minDist = dist;
          bestSample = SampleResult(sample);
        }
      }
    }
  }

  std.textureStore(pingPongLayout.$.writeView, d.vec2i(x, y), 0, bestSample.color);
  std.textureStore(pingPongLayout.$.writeView, d.vec2i(x, y), 1, d.vec4f(bestSample.coord, 0, 0));
});

const voronoiFrag = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) =>
  std.textureSample(colorSampleLayout.$.floodTexture, colorSampleLayout.$.sampler, uv),
);

const voronoiPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: voronoiFrag,
  targets: { format: presentationFormat },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function swap() {
  sourceIdx = 1 - sourceIdx;
}

function render() {
  voronoiPipeline
    .with(resources.renderBindGroups[sourceIdx])
    .withColorAttachment({ view: context })
    .draw(3);
}

async function runFloodAnimated(runId: number) {
  render();
  await sleep(stepDelayMs);
  if (runId !== currentRunId) return;

  const maxRange = Math.floor(Math.max(canvas.width, canvas.height) / 2);
  let offset = Math.floor(maxRange * startingRangePercent);

  while (offset >= 1) {
    if (runId !== currentRunId) return;

    offsetUniform.write(offset);
    jumpFlood
      .with(resources.pingPongBindGroups[sourceIdx])
      .dispatchThreads(canvas.width, canvas.height);
    swap();
    render();
    await sleep(stepDelayMs);

    offset = Math.floor(offset / 2);
  }
}

function recreateResources() {
  for (const t of resources.textures) {
    t.destroy();
  }
  resources = createResources();
  sourceIdx = 0;
}

function initRandom() {
  timeUniform.write((performance.now() % 10000) / 10000 - 1);
  initializeRandom.with(resources.initBindGroups[0]).dispatchThreads(canvas.width, canvas.height);
  sourceIdx = 0;
}

function reset() {
  currentRunId++;
  initRandom();
  void runFloodAnimated(currentRunId);
}

reset();

// #region Example controls & Cleanup

let resizeTimeout: ReturnType<typeof setTimeout>;
const resizeObserver = new ResizeObserver(() => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    recreateResources();
    reset();
  }, 100);
});
resizeObserver.observe(canvas);

export const controls = defineControls({
  'Run Algorithm': {
    onButtonClick: () => {
      currentRunId++;
      void runFloodAnimated(currentRunId);
    },
  },
  'Random Seeds': {
    onButtonClick: reset,
  },
  'Seed density': {
    initial: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(value) {
      const density = 10 ** (-5 + 4 * value);
      seedThreshold = 1 - density;
      seedThresholdUniform.write(seedThreshold);
      reset();
    },
  },
  'Step delay (ms)': {
    initial: stepDelayMs,
    min: 0,
    max: 1000,
    step: 50,
    onSliderChange(value) {
      stepDelayMs = value;
    },
  },
  Range: {
    initial: '100%',
    options: ['100%', '50%', '20%', '10%', '1%'],
    onSelectChange(value) {
      startingRangePercent = Number.parseFloat(value) / 100;
      reset();
    },
  },
});

export function onCleanup() {
  clearTimeout(resizeTimeout);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
