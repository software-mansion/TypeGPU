import { randf } from '@typegpu/noise';
import tgpu, {
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  bitpackedDisplayLayout,
  bitpackedLayout,
  computeLayout,
  displayLayout,
  gameSizeAccessor,
  TILE_SIZE,
} from './shaders/common.ts';
import { tiledCompute } from './shaders/tiled-compute.ts';
import { naiveCompute } from './shaders/naive-compute.ts';
import { bitpackedCompute } from './shaders/bitpacked-compute.ts';
import { sdLine } from '@typegpu/sdf';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init({
  device: {
    requiredFeatures: ['timestamp-query'],
  },
});

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let gameSize = 64;
const gameSizeUniform = root.createUniform(d.u32, gameSize);
const timeUniform = root.createUniform(d.f32, 0);
const nearestSampler = root.device.createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
});

let dataTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: 'r32uint';
  }>
  & StorageFlag
  & SampledFlag
)[];
let computeBindGroups: TgpuBindGroup<typeof computeLayout.entries>[];
let displayBindGroups: TgpuBindGroup<typeof displayLayout.entries>[];

// Bitpacked resources (separate because different texture dimensions)
let bitpackedTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: 'r32uint';
  }>
  & StorageFlag
  & SampledFlag
)[];
let bitpackedComputeBindGroups: TgpuBindGroup<typeof bitpackedLayout.entries>[];
let bitpackedDisplayBindGroups: TgpuBindGroup<
  typeof bitpackedDisplayLayout.entries
>[];

let even = 0;

const randomInit = root['~unstable'].createGuardedComputePipeline((x, y) => {
  'use gpu';
  randf.seed2(d.vec2f(x, y).div(d.f32(gameSizeUniform.$)).mul(timeUniform.$));
  std.textureStore(
    computeLayout.$.next,
    d.vec2u(x, y),
    d.vec4u(std.select(0, 1, randf.sample() > 0.5), 0, 0, 0),
  );
});

const BrushStroke = d.struct({
  start: d.vec2f,
  end: d.vec2f,
  radius: d.f32,
  mode: d.u32,
});
let brushRadius = 0.05;
let brushMode: 0 | 1 | 2 = 2;
let latestPointerPos: { x: number; y: number } | null = null;
let lastFramePos: { x: number; y: number } | null = null;
const brushStrokeUniform = root.createUniform(BrushStroke, {
  start: d.vec2f(0.5),
  end: d.vec2f(0.5),
  radius: brushRadius,
  mode: brushMode,
});

const handleDraw = root['~unstable'].createGuardedComputePipeline((x, y) => {
  'use gpu';
  const uv = d.vec2f(x, y).div(d.f32(gameSizeUniform.$));
  const stroke = brushStrokeUniform.$;
  randf.seed2(d.vec2f(x, y).div(d.f32(gameSizeUniform.$)).mul(timeUniform.$));
  if (sdLine(uv, stroke.start, stroke.end) <= stroke.radius) {
    let out = d.u32(0);
    if (stroke.mode === d.u32(0)) {
      out = d.u32(1);
    }
    if (stroke.mode === d.u32(2)) {
      out = std.select(d.u32(0), d.u32(1), randf.sample() > 0.5);
    }
    std.textureStore(
      computeLayout.$.next,
      d.vec2u(x, y),
      d.vec4u(out, 0, 0, 0),
    );
  }
});

// Bitpacked draw: each thread handles 32 cells (one packed u32)
const handleDrawBitpacked = root['~unstable'].createGuardedComputePipeline(
  (px, py) => {
    'use gpu';
    const gs = d.f32(gameSizeUniform.$);
    const stroke = brushStrokeUniform.$;

    // Read current packed value
    const current = std.textureLoad(
      bitpackedLayout.$.current,
      d.vec2u(px, py),
      d.i32(0),
    ).x;

    // Build mask of affected cells and their new values
    let affectedMask = d.u32(0);
    let newValues = d.u32(0);

    for (let i = 0; i < 32; i++) {
      const cellX = d.f32(d.u32(px) * d.u32(32) + d.u32(i));
      const cellY = d.f32(py);
      const uv = d.vec2f(cellX, cellY).div(gs);

      if (sdLine(uv, stroke.start, stroke.end) <= stroke.radius) {
        const bit = d.u32(1) << d.u32(i);
        affectedMask = affectedMask | bit;

        // Determine new value based on mode
        if (stroke.mode === d.u32(0)) {
          // Add mode: set bit
          newValues = newValues | bit;
        } else if (stroke.mode === d.u32(2)) {
          // Random mode
          randf.seed2(d.vec2f(cellX, cellY).div(gs).mul(timeUniform.$));
          if (randf.sample() > 0.5) {
            newValues = newValues | bit;
          }
        }
        // Delete mode (1): newValues bit stays 0
      }
    }

    // Apply: keep unaffected bits from current, use new values for affected bits
    const result = (current & (affectedMask ^ d.u32(0xFFFFFFFF))) |
      (newValues & affectedMask);

    std.textureStore(
      bitpackedLayout.$.next,
      d.vec2u(px, py),
      d.vec4u(result, 0, 0, 0),
    );
  },
);

const computePipelines = {
  tiled: root['~unstable']
    .with(gameSizeAccessor, gameSizeUniform)
    .withCompute(tiledCompute)
    .createPipeline()
    .withPerformanceCallback((start, end) => {
      console.log(`Tiled: ${Number(end - start) / 1_000_00}ms`);
    }),
  naive: root['~unstable']
    .with(gameSizeAccessor, gameSizeUniform)
    .withCompute(naiveCompute)
    .createPipeline().withPerformanceCallback((start, end) => {
      console.log(`Naive: ${Number(end - start) / 1_000_00}ms`);
    }),
  bitpacked: root['~unstable']
    .with(gameSizeAccessor, gameSizeUniform)
    .withCompute(bitpackedCompute)
    .createPipeline()
    .withPerformanceCallback((start, end) => {
      console.log(`Bitpacked: ${Number(end - start) / 1_000_00}ms`);
    }),
};

const displayFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const value = std.textureLoad(
    displayLayout.$.source,
    d.vec2u(uv.mul(d.f32(gameSizeUniform.$))),
  ).x;
  return std.select(d.vec4f(0), d.vec4f(0, uv, 1), value === 1);
});

const displayPipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(displayFragment, { format: presentationFormat })
  .createPipeline();

// Bitpacked display: unpack bits from packed texture
const bitpackedDisplayFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const gs = d.f32(gameSizeUniform.$);
  const pixelCoord = uv.mul(gs);
  const cellX = d.u32(pixelCoord.x);
  const cellY = d.u32(pixelCoord.y);

  // Which u32 contains this cell, and which bit within it
  const packedX = cellX / 32;
  const bitIndex = cellX % 32;

  const packed = std.textureLoad(
    bitpackedDisplayLayout.$.source,
    d.vec2u(packedX, cellY),
  ).x;

  const value = (packed >> bitIndex) & d.u32(1);
  return std.select(d.vec4f(0), d.vec4f(0, uv, 1), value === 1);
});

const bitpackedDisplayPipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(bitpackedDisplayFragment, { format: presentationFormat })
  .createPipeline();

// Bitpacked random init: each thread sets one u32 (32 cells)
const bitpackedRandomInit = root['~unstable'].createGuardedComputePipeline(
  (x, y) => {
    'use gpu';
    let packed = d.u32(0);
    for (let i = 0; i < 32; i++) {
      randf.seed2(
        d.vec2f(d.f32(x) * 32 + d.f32(i), d.f32(y))
          .div(d.f32(gameSizeUniform.$))
          .mul(timeUniform.$),
      );
      packed = packed |
        (std.select(d.u32(0), d.u32(1), randf.sample() > 0.5) << d.u32(i));
    }
    std.textureStore(
      bitpackedLayout.$.next,
      d.vec2u(x, y),
      d.vec4u(packed, 0, 0, 0),
    );
  },
);

let chosenPipeline: 'tiled' | 'naive' | 'bitpacked' = 'tiled';

const recreateResources = (size: number) => {
  gameSize = size;
  gameSizeUniform.write(size);

  // Standard textures
  dataTextures = Array.from({ length: 2 }, () =>
    root['~unstable']
      .createTexture({
        size: [size, size],
        format: 'r32uint',
      })
      .$usage('storage', 'sampled'));
  computeBindGroups = [
    root.createBindGroup(computeLayout, {
      current: dataTextures[0],
      next: dataTextures[1],
      sampler: nearestSampler,
    }),
    root.createBindGroup(computeLayout, {
      current: dataTextures[1],
      next: dataTextures[0],
      sampler: nearestSampler,
    }),
  ];
  displayBindGroups = [
    root.createBindGroup(displayLayout, {
      source: dataTextures[0],
    }),
    root.createBindGroup(displayLayout, {
      source: dataTextures[1],
    }),
  ];

  // Bitpacked textures (width / 32)
  const packedWidth = size / 32;
  bitpackedTextures = Array.from({ length: 2 }, () =>
    root['~unstable']
      .createTexture({
        size: [packedWidth, size],
        format: 'r32uint',
      })
      .$usage('storage', 'sampled'));
  bitpackedComputeBindGroups = [
    root.createBindGroup(bitpackedLayout, {
      current: bitpackedTextures[0],
      next: bitpackedTextures[1],
      sampler: nearestSampler,
    }),
    root.createBindGroup(bitpackedLayout, {
      current: bitpackedTextures[1],
      next: bitpackedTextures[0],
      sampler: nearestSampler,
    }),
  ];
  bitpackedDisplayBindGroups = [
    root.createBindGroup(bitpackedDisplayLayout, {
      source: bitpackedTextures[0],
    }),
    root.createBindGroup(bitpackedDisplayLayout, {
      source: bitpackedTextures[1],
    }),
  ];

  even = 0;
  timeUniform.write((performance.now() / 1000) % 100);

  // Initialize based on current pipeline
  if (chosenPipeline === 'bitpacked') {
    bitpackedRandomInit
      .with(bitpackedComputeBindGroups[0])
      .dispatchThreads(packedWidth, size);
  } else {
    randomInit.with(computeBindGroups[0]).dispatchThreads(size, size);
  }
};

recreateResources(gameSize);

let isDrawing = false;
let paused = false;
let minTimestepMs = 0;
let lastStepTime = 0;
let stepsPerTimestep = 1;

const updatePointer = (x: number, y: number) => {
  latestPointerPos = { x, y };
};

const drawAt = (clientX: number, clientY: number) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  updatePointer(x, y);
};

canvas.addEventListener('pointerdown', (event) => {
  isDrawing = true;
  drawAt(event.clientX, event.clientY);
});
canvas.addEventListener('pointermove', (event) => {
  if (!isDrawing) return;
  drawAt(event.clientX, event.clientY);
});
const stopDrawing = () => {
  isDrawing = false;
  lastFramePos = null;
};
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointerleave', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

const stepOnce = (timestamp: number) => {
  timeUniform.write((timestamp / 1000) % 100);
  lastStepTime = timestamp;
  even ^= 1;

  if (chosenPipeline === 'bitpacked') {
    const packedWidth = gameSize / 32;
    const computeBg = bitpackedComputeBindGroups[even];
    computePipelines.bitpacked
      .with(computeBg)
      .dispatchWorkgroups(
        Math.ceil(packedWidth / TILE_SIZE),
        Math.ceil(gameSize / TILE_SIZE),
      );
  } else {
    const computeBg = computeBindGroups[even];
    computePipelines[chosenPipeline]
      .with(computeBg)
      .dispatchWorkgroups(
        gameSize / TILE_SIZE,
        gameSize / TILE_SIZE,
      );
  }
};

function frame(timestamp: number) {
  if (isDrawing && latestPointerPos) {
    const start = lastFramePos ?? latestPointerPos;
    const end = latestPointerPos;
    brushStrokeUniform.write({
      start: d.vec2f(start.x, start.y),
      end: d.vec2f(end.x, end.y),
      radius: brushRadius,
      mode: brushMode,
    });

    if (chosenPipeline === 'bitpacked') {
      const packedWidth = gameSize / 32;
      handleDrawBitpacked
        .with(bitpackedComputeBindGroups[0])
        .dispatchThreads(packedWidth, gameSize);
      handleDrawBitpacked
        .with(bitpackedComputeBindGroups[1])
        .dispatchThreads(packedWidth, gameSize);
    } else {
      handleDraw.with(computeBindGroups[0]).dispatchThreads(
        gameSize,
        gameSize,
      );
      handleDraw.with(computeBindGroups[1]).dispatchThreads(
        gameSize,
        gameSize,
      );
    }
    lastFramePos = { x: end.x, y: end.y };
  } else {
    lastFramePos = null;
  }

  const shouldStep = !paused && (timestamp - lastStepTime >= minTimestepMs);
  if (shouldStep) {
    for (let i = 0; i < stepsPerTimestep; i++) {
      stepOnce(timestamp);
    }
  }

  // Use appropriate display pipeline based on mode
  if (chosenPipeline === 'bitpacked') {
    const displayBg = bitpackedDisplayBindGroups[1 - even];
    bitpackedDisplayPipeline
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      })
      .with(displayBg)
      .draw(3);
  } else {
    const displayBg = displayBindGroups[1 - even];
    displayPipeline
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      })
      .with(displayBg)
      .draw(3);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// #region Example controls & Cleanup

export const controls = {
  size: {
    initial: '64',
    options: [16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192].map((x) =>
      x.toString()
    ),
    onSelectChange: (value: string) => {
      recreateResources(Number.parseInt(value));
    },
  },
  pipeline: {
    initial: 'tiled',
    options: ['tiled', 'naive', 'bitpacked'],
    onSelectChange: (value: 'tiled' | 'naive' | 'bitpacked') => {
      const wasBitpacked = chosenPipeline === 'bitpacked';
      const isBitpacked = value === 'bitpacked';
      chosenPipeline = value;
      if (wasBitpacked !== isBitpacked) {
        recreateResources(gameSize);
      }
    },
  },
  'brush radius': {
    initial: 0.05,
    min: 0.005,
    max: 0.2,
    step: 0.005,
    onSliderChange: (value: number) => {
      brushRadius = value;
      const p = latestPointerPos ?? lastFramePos ?? { x: 0.5, y: 0.5 };
      brushStrokeUniform.write({
        start: d.vec2f(p.x, p.y),
        end: d.vec2f(p.x, p.y),
        radius: brushRadius,
        mode: brushMode,
      });
    },
  },
  'brush mode': {
    initial: 'random',
    options: ['add', 'delete', 'random'],
    onSelectChange: (value: 'add' | 'delete' | 'random') => {
      brushMode = value === 'add' ? 0 : value === 'delete' ? 1 : 2;
      const p = latestPointerPos ?? lastFramePos ?? { x: 0.5, y: 0.5 };
      brushStrokeUniform.write({
        start: d.vec2f(p.x, p.y),
        end: d.vec2f(p.x, p.y),
        radius: brushRadius,
        mode: brushMode,
      });
    },
  },
  'min timestep (ms)': {
    initial: 0,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (value: number) => {
      minTimestepMs = value;
    },
  },
  'steps per frame': {
    initial: 1,
    min: 1,
    max: 100,
    step: 1,
    onSliderChange: (value: number) => {
      stepsPerTimestep = value;
    },
  },
  pause: {
    initial: false,
    onToggleChange: (value: boolean) => {
      paused = value;
    },
  },
  Step: {
    onButtonClick: () => {
      stepOnce(performance.now());
    },
  },
  Clear: {
    onButtonClick: () => {
      if (chosenPipeline === 'bitpacked') {
        bitpackedTextures[0].clear();
        bitpackedTextures[1].clear();
      } else {
        dataTextures[0].clear();
        dataTextures[1].clear();
      }
      even = 0;
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
