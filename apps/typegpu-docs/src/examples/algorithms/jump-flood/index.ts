import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';
import { fullScreenTriangle } from 'typegpu/common';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

let stepDelayMs = 500;
let seedThreshold = 0.999;
let startingRangePercent = 1;
let currentRunId = 0;

const palette = tgpu.const(d.arrayOf(d.vec3f, 4), [
  d.vec3f(0xeb / 255, 0xcf / 255, 0xff / 255),
  d.vec3f(0xb7 / 255, 0x8b / 255, 0xfa / 255),
  d.vec3f(0x8b / 255, 0x5c / 255, 0xf6 / 255),
  d.vec3f(0x6d / 255, 0x44 / 255, 0xf2 / 255),
]);

const seedThresholdUniform = root.createUniform(d.f32, seedThreshold);
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

const floodLayout = tgpu.bindGroupLayout({
  writeView: {
    storageTexture: d.textureStorage2dArray('rgba16float', 'write-only'),
  },
  readView: {
    storageTexture: d.textureStorage2dArray('rgba16float', 'read-only'),
  },
});

const sampleLayout = tgpu.bindGroupLayout({
  floodTexture: { texture: d.texture2d() },
});

function createTextures() {
  return [0, 1].map(() =>
    root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height, 2],
        format: 'rgba16float',
      })
      .$usage('sampled', 'storage')
  );
}

function createFloodBindGroups(textures: ReturnType<typeof createTextures>) {
  return [0, 1].map((i) =>
    root.createBindGroup(floodLayout, {
      writeView: textures[1 - i],
      readView: textures[i],
    })
  );
}

let textures = createTextures();
let floodBindGroups = createFloodBindGroups(textures);
let initBindGroup = root.createBindGroup(initLayout, {
  writeView: textures[0],
});

const initializeRandom = root['~unstable'].createGuardedComputePipeline(
  (x, y) => {
    'use gpu';
    const size = std.textureDimensions(initLayout.$.writeView);
    randf.seed2(d.vec2f(x, y).div(d.vec2f(size)));

    const randomVal = randf.sample();
    const isSeed = randomVal >= seedThresholdUniform.$;

    const paletteColor = palette.$[d.u32(std.floor(randf.sample() * 4))];
    const variation = d.vec3f(
      randf.sample() - 0.5,
      randf.sample() - 0.5,
      randf.sample() - 0.5,
    ).mul(0.15);

    const color = std.select(
      d.vec4f(),
      d.vec4f(std.saturate(paletteColor.add(variation)), 1),
      isSeed,
    );
    const coord = std.select(
      d.vec2f(-1),
      d.vec2f(x, y).div(d.vec2f(size)),
      isSeed,
    );

    std.textureStore(initLayout.$.writeView, d.vec2i(x, y), 0, color);
    std.textureStore(
      initLayout.$.writeView,
      d.vec2i(x, y),
      1,
      d.vec4f(coord, 0, 0),
    );
  },
);

const sampleWithOffset = (
  tex: d.textureStorage2dArray<'rgba16float', 'read-only'>,
  pos: d.v2i,
  offset: d.v2i,
) => {
  'use gpu';
  const dims = std.textureDimensions(tex);
  const samplePos = pos.add(offset);

  const outOfBounds = samplePos.x < 0 ||
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

const jumpFlood = root['~unstable'].createGuardedComputePipeline((x, y) => {
  'use gpu';
  const offset = offsetUniform.$;
  const size = std.textureDimensions(floodLayout.$.readView);

  let minDist = 1e20;
  let bestSample = SampleResult({ color: d.vec4f(), coord: d.vec2f(-1) });

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const sample = sampleWithOffset(
        floodLayout.$.readView,
        d.vec2i(x, y),
        d.vec2i(dx * offset, dy * offset),
      );

      if (sample.coord.x < 0) {
        continue;
      }

      const dist = std.distance(d.vec2f(x, y), sample.coord.mul(d.vec2f(size)));
      if (dist < minDist) {
        minDist = dist;
        bestSample = SampleResult(sample);
      }
    }
  }

  std.textureStore(floodLayout.$.writeView, d.vec2i(x, y), 0, bestSample.color);
  std.textureStore(
    floodLayout.$.writeView,
    d.vec2i(x, y),
    1,
    d.vec4f(bestSample.coord, 0, 0),
  );
});

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const sampleFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) =>
  std.textureSample(sampleLayout.$.floodTexture, filteringSampler.$, uv)
);

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(sampleFrag, { format: presentationFormat })
  .createPipeline();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function render(textureIndex: number) {
  renderPipeline
    .with(
      root.createBindGroup(sampleLayout, {
        floodTexture: textures[textureIndex],
      }),
    )
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
}

async function runFloodAnimated(runId: number) {
  render(0);
  await sleep(stepDelayMs);

  if (runId !== currentRunId) {
    return;
  }

  const maxRange = Math.floor(Math.max(canvas.width, canvas.height) / 2);
  let offset = Math.floor(maxRange * startingRangePercent);
  let i = 0;

  while (offset >= 1) {
    if (runId !== currentRunId) {
      return;
    }

    offsetUniform.write(offset);
    jumpFlood.with(floodBindGroups[i % 2]).dispatchThreads(
      canvas.width,
      canvas.height,
    );

    render((i + 1) % 2);
    await sleep(stepDelayMs);

    offset = Math.floor(offset / 2);
    i++;
  }
}

function recreateResources() {
  for (const t of textures) {
    t.destroy();
  }
  textures = createTextures();
  floodBindGroups = createFloodBindGroups(textures);
  initBindGroup = root.createBindGroup(initLayout, { writeView: textures[0] });
}

function reset() {
  currentRunId++;
  initializeRandom.with(initBindGroup).dispatchThreads(
    canvas.width,
    canvas.height,
  );
  runFloodAnimated(currentRunId);
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

export const controls = {
  Reset: {
    onButtonClick: reset,
  },
  'Seed density (%)': {
    initial: 0.1,
    min: 0.001,
    max: 5,
    step: 0.001,
    onSliderChange(value: number) {
      seedThreshold = 1 - value / 100;
      seedThresholdUniform.write(seedThreshold);
      reset();
    },
  },
  'Step delay (ms)': {
    initial: stepDelayMs,
    min: 0,
    max: 1000,
    step: 50,
    onSliderChange(value: number) {
      stepDelayMs = value;
    },
  },
  Range: {
    initial: '100%',
    options: ['100%', '50%', '20%', '10%', '1%'],
    onSelectChange(value: string) {
      startingRangePercent = Number.parseFloat(value) / 100;
      reset();
    },
  },
};

export function onCleanup() {
  clearTimeout(resizeTimeout);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
