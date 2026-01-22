import { randf } from '@typegpu/noise';
import tgpu, {
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuComputeFn,
  type TgpuTexture,
} from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
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
  device: { optionalFeatures: ['timestamp-query'] },
});
const hasTimestamp = root.enabledFeatures.has('timestamp-query');

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
  addressModeU: 'repeat',
  addressModeV: 'repeat',
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

const handleDrawBitpacked = root['~unstable'].createGuardedComputePipeline(
  (px, py) => {
    'use gpu';
    const gs = d.f32(gameSizeUniform.$);
    const stroke = brushStrokeUniform.$;

    // Read current packed value
    const current = std.textureLoad(
      computeLayout.$.current,
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
      computeLayout.$.next,
      d.vec2u(px, py),
      d.vec4u(result, 0, 0, 0),
    );
  },
);

function createPipeline(name: string, compute: TgpuComputeFn) {
  const base = root['~unstable']
    .with(gameSizeAccessor, gameSizeUniform)
    .withCompute(compute)
    .createPipeline();

  return !hasTimestamp ? base : base
    .withPerformanceCallback((start, end) => {
      console.log(`${name}: ${Number(end - start) / 1_000_00}ms`);
    });
}

const computePipelines = {
  tiled: createPipeline('Tiled', tiledCompute),
  naive: createPipeline('Naive', naiveCompute),
  bitpacked: createPipeline('Bitpacked', bitpackedCompute),
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
    displayLayout.$.source,
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
      computeLayout.$.next,
      d.vec2u(x, y),
      d.vec4u(packed, 0, 0, 0),
    );
  },
);

let chosenPipeline: 'tiled' | 'naive' | 'bitpacked' = 'tiled';

const recreateResources = (size: number) => {
  gameSize = size;
  gameSizeUniform.write(size);

  const isBitpacked = chosenPipeline === 'bitpacked';

  dataTextures = Array.from({ length: 2 }, () =>
    root['~unstable']
      .createTexture({
        size: [isBitpacked ? size / 32 : size, size],
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
    root.createBindGroup(displayLayout, { source: dataTextures[0] }),
    root.createBindGroup(displayLayout, { source: dataTextures[1] }),
  ];

  even = 0;
  timeUniform.write((performance.now() / 1000) % 100);

  const [initFn, [x, y]] = chosenPipeline === 'bitpacked'
    ? [bitpackedRandomInit, [size / 32, size]]
    : [randomInit, [size, size]];

  initFn.with(computeBindGroups[0]).dispatchThreads(x, y);
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

  computePipelines[chosenPipeline]
    .with(computeBindGroups[even])
    .dispatchWorkgroups(
      Math.max(
        1,
        gameSize /
          (chosenPipeline === 'bitpacked' ? TILE_SIZE * 32 : TILE_SIZE),
      ),
      gameSize / TILE_SIZE,
    );
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

    const [pipeline, [x, y], swap] = chosenPipeline === 'bitpacked'
      ? [handleDrawBitpacked, [gameSize / 32, gameSize], true]
      : [handleDraw, [gameSize, gameSize], false];

    // We need to read the current state in the bitpacked version (not to overwrite unaffected cells)
    // In the normal version we can write per cell so this is not an issue
    if (swap) {
      even ^= 1;
    }

    pipeline
      .with(computeBindGroups[even])
      .dispatchThreads(x, y);

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

  const chosenDisplayPipeline = chosenPipeline === 'bitpacked'
    ? bitpackedDisplayPipeline
    : displayPipeline;

  chosenDisplayPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(displayBindGroups[1 - even])
    .draw(3);

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
      dataTextures[0].clear();
      dataTextures[1].clear();
      even = 0;
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
