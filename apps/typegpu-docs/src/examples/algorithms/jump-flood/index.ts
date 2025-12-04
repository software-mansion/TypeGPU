import tgpu, {
  type SampledFlag,
  type StorageFlag,
  type TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';
import { fullScreenTriangle } from 'typegpu/common';
import {
  colorSampleLayout,
  coordSampleLayout,
  distanceFrag,
  voronoiFrag,
} from './visualization.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

let stepDelayMs = 50;
let seedThreshold = 0.999;
let startingRangePercent = 1;
let currentRunId = 0;
let visualizationMode: 'voronoi' | 'distance' = 'voronoi';
let brushSize = 10;
let brushColor = d.vec3f(0x8b / 255, 0x5c / 255, 0xf6 / 255);
let isDrawing = false;
let lastDrawPos: { x: number; y: number } | null = null;
let sourceIdx = 0;

const palette = tgpu.const(d.arrayOf(d.vec3f, 4), [
  d.vec3f(0xeb / 255, 0xcf / 255, 0xff / 255),
  d.vec3f(0xb7 / 255, 0x8b / 255, 0xfa / 255),
  d.vec3f(0x8b / 255, 0x5c / 255, 0xf6 / 255),
  d.vec3f(0x6d / 255, 0x44 / 255, 0xf2 / 255),
]);

const seedThresholdUniform = root.createUniform(d.f32, seedThreshold);
const offsetUniform = root.createUniform(d.i32);
const brushPosUniform = root.createUniform(d.vec2f);
const brushSizeUniform = root.createUniform(d.f32, brushSize);
const brushColorUniform = root.createUniform(d.vec3f, brushColor);

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

type FloodTexture =
  & TgpuTexture<{
    size: [number, number, 2];
    format: 'rgba16float';
  }>
  & SampledFlag
  & StorageFlag;

function createTextures() {
  return [0, 1].map(() =>
    root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height, 2],
        format: 'rgba16float',
      })
      .$usage('sampled', 'storage')
  ) as [FloodTexture, FloodTexture];
}

function createPingPongBindGroups(textures: [FloodTexture, FloodTexture]) {
  return [0, 1].map((i) =>
    root.createBindGroup(pingPongLayout, {
      readView: textures[i],
      writeView: textures[1 - i],
    })
  );
}

let textures = createTextures();
let pingPongBindGroups = createPingPongBindGroups(textures);
let renderBindGroups: ReturnType<typeof createRenderBindGroups>;

function createRenderBindGroups(textures: [FloodTexture, FloodTexture]) {
  return textures.map((tex) => ({
    color: root.createBindGroup(colorSampleLayout, {
      floodTexture: tex.createView(d.texture2d(), {
        baseArrayLayer: 0,
        arrayLayerCount: 1,
      }),
      sampler: filteringSampler,
    }),
    coord: root.createBindGroup(coordSampleLayout, {
      coordTexture: tex.createView(d.texture2d(), {
        baseArrayLayer: 1,
        arrayLayerCount: 1,
      }),
      sampler: filteringSampler,
    }),
  }));
}

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
  const size = std.textureDimensions(pingPongLayout.$.readView);

  let minDist = 1e20;
  let bestSample = SampleResult({ color: d.vec4f(), coord: d.vec2f(-1) });

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const sample = sampleWithOffset(
        pingPongLayout.$.readView,
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

  std.textureStore(
    pingPongLayout.$.writeView,
    d.vec2i(x, y),
    0,
    bestSample.color,
  );
  std.textureStore(
    pingPongLayout.$.writeView,
    d.vec2i(x, y),
    1,
    d.vec4f(bestSample.coord, 0, 0),
  );
});

const drawSeed = root['~unstable'].createGuardedComputePipeline((x, y) => {
  'use gpu';
  const size = std.textureDimensions(pingPongLayout.$.writeView);
  const pos = d.vec2f(x, y);
  const inBrush = std.distance(pos, brushPosUniform.$) <= brushSizeUniform.$;

  const existingColor = std.textureLoad(
    pingPongLayout.$.readView,
    d.vec2i(x, y),
    0,
  );
  const existingCoord = std.textureLoad(
    pingPongLayout.$.readView,
    d.vec2i(x, y),
    1,
  );

  const newColor = d.vec4f(brushColorUniform.$, 1);
  const newCoord = d.vec4f(pos.div(d.vec2f(size)), 0, 0);

  std.textureStore(
    pingPongLayout.$.writeView,
    d.vec2i(x, y),
    0,
    std.select(existingColor, newColor, inBrush),
  );
  std.textureStore(
    pingPongLayout.$.writeView,
    d.vec2i(x, y),
    1,
    std.select(existingCoord, newCoord, inBrush),
  );
});

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

renderBindGroups = createRenderBindGroups(textures);

const voronoiPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(voronoiFrag, { format: presentationFormat })
  .createPipeline();

const distancePipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(distanceFrag, { format: presentationFormat })
  .createPipeline();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function swap() {
  sourceIdx = 1 - sourceIdx;
}

function render() {
  const colorAttachment = {
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear' as const,
    storeOp: 'store' as const,
  };

  if (visualizationMode === 'voronoi') {
    voronoiPipeline
      .with(renderBindGroups[sourceIdx].color)
      .withColorAttachment(colorAttachment)
      .draw(3);
  } else {
    distancePipeline
      .with(renderBindGroups[sourceIdx].coord)
      .withColorAttachment(colorAttachment)
      .draw(3);
  }
}

function drawAtPosition(canvasX: number, canvasY: number) {
  const rect = canvas.getBoundingClientRect();
  brushPosUniform.write(d.vec2f(
    canvasX * canvas.width / rect.width,
    canvasY * canvas.height / rect.height,
  ));
  brushSizeUniform.write(brushSize);
  drawSeed.with(pingPongBindGroups[sourceIdx]).dispatchThreads(
    canvas.width,
    canvas.height,
  );
  swap();
  render();
}

function interpolateAndDraw(x: number, y: number) {
  if (lastDrawPos) {
    const dx = x - lastDrawPos.x;
    const dy = y - lastDrawPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist / Math.max(1, brushSize / 3));
    for (let i = 0; i <= steps; i++) {
      const t = steps > 0 ? i / steps : 0;
      drawAtPosition(lastDrawPos.x + dx * t, lastDrawPos.y + dy * t);
    }
  } else {
    drawAtPosition(x, y);
  }
  lastDrawPos = { x, y };
}

const clearTexture = root['~unstable'].createGuardedComputePipeline((x, y) => {
  'use gpu';
  std.textureStore(initLayout.$.writeView, d.vec2i(x, y), 0, d.vec4f());
  std.textureStore(
    initLayout.$.writeView,
    d.vec2i(x, y),
    1,
    d.vec4f(-1, -1, 0, 0),
  );
});

function clearCanvas() {
  clearTexture
    .with(root.createBindGroup(initLayout, { writeView: textures[0] }))
    .dispatchThreads(canvas.width, canvas.height);
  clearTexture
    .with(root.createBindGroup(initLayout, { writeView: textures[1] }))
    .dispatchThreads(canvas.width, canvas.height);
  sourceIdx = 0;
  render();
}

async function runFloodAnimated(runId: number) {
  render();
  await sleep(stepDelayMs);
  if (runId !== currentRunId) {
    return;
  }

  const maxRange = Math.floor(Math.max(canvas.width, canvas.height) / 2);
  let offset = Math.floor(maxRange * startingRangePercent);

  while (offset >= 1) {
    if (runId !== currentRunId) {
      return;
    }

    offsetUniform.write(offset);
    jumpFlood.with(pingPongBindGroups[sourceIdx]).dispatchThreads(
      canvas.width,
      canvas.height,
    );
    swap();
    render();
    await sleep(stepDelayMs);

    offset = Math.floor(offset / 2);
  }
}

function recreateResources() {
  for (const t of textures) {
    t.destroy();
  }
  textures = createTextures();
  pingPongBindGroups = createPingPongBindGroups(textures);
  renderBindGroups = createRenderBindGroups(textures);
  sourceIdx = 0;
}

function initRandom() {
  const initBindGroup = root.createBindGroup(initLayout, {
    writeView: textures[0],
  });
  initializeRandom.with(initBindGroup).dispatchThreads(
    canvas.width,
    canvas.height,
  );
  sourceIdx = 0;
}

function reset() {
  currentRunId++;
  initRandom();
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

const onMouseDown = (e: MouseEvent) => {
  if (e.button !== 0) return;
  isDrawing = true;
  lastDrawPos = null;
  const rect = canvas.getBoundingClientRect();
  interpolateAndDraw(e.clientX - rect.left, e.clientY - rect.top);
};
const onMouseMove = (e: MouseEvent) => {
  if (!isDrawing) return;
  const rect = canvas.getBoundingClientRect();
  interpolateAndDraw(e.clientX - rect.left, e.clientY - rect.top);
};
const onMouseUp = () => {
  isDrawing = false;
  lastDrawPos = null;
};

canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('mouseleave', onMouseUp);

export const controls = {
  'Run Algorithm': {
    onButtonClick: () => {
      currentRunId++;
      runFloodAnimated(currentRunId);
    },
  },
  'Random Seeds': {
    onButtonClick: reset,
  },
  Clear: {
    onButtonClick: clearCanvas,
  },
  'Brush size': {
    initial: brushSize,
    min: 1,
    max: 50,
    step: 1,
    onSliderChange(value: number) {
      brushSize = value;
    },
  },
  'Brush color': {
    initial: brushColor,
    onColorChange(value: readonly [number, number, number]) {
      brushColor = d.vec3f(...value);
      brushColorUniform.write(brushColor);
    },
  },
  Visualization: {
    initial: 'Voronoi',
    options: ['Voronoi', 'Distance'],
    onSelectChange(value: string) {
      visualizationMode = value.toLowerCase() as 'voronoi' | 'distance';
      render();
    },
  },
  'Seed density (%)': {
    initial: 0.1,
    min: 0.0001,
    max: 0.1,
    step: 0.0001,
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
