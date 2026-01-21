import { randf } from '@typegpu/noise';
import tgpu, {
  type StorageFlag,
  type TgpuBindGroup,
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

let dataTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: 'r32uint';
  }>
  & StorageFlag
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

const recreateResources = (size: number) => {
  gameSize = size;
  gameSizeUniform.write(size);
  dataTextures = Array.from({ length: 2 }, () =>
    root['~unstable']
      .createTexture({
        size: [size, size],
        format: 'r32uint',
      })
      .$usage('storage'));
  computeBindGroups = [
    root.createBindGroup(computeLayout, {
      current: dataTextures[0],
      next: dataTextures[1],
    }),
    root.createBindGroup(computeLayout, {
      current: dataTextures[1],
      next: dataTextures[0],
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
  even = 0;
  timeUniform.write((performance.now() / 1000) % 100);
  randomInit.with(computeBindGroups[0]).dispatchThreads(size, size);
};

recreateResources(gameSize);

let chosenPipeline: 'tiled' | 'naive' = 'tiled';
let isDrawing = false;
let paused = false;
let minTimestepMs = 0;
let lastStepTime = 0;

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
  const computeBg = computeBindGroups[even];
  computePipelines[chosenPipeline]
    .with(computeBg)
    .dispatchWorkgroups(
      gameSize / TILE_SIZE,
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
    handleDraw.with(computeBindGroups[0]).dispatchThreads(
      gameSize,
      gameSize,
    );
    handleDraw.with(computeBindGroups[1]).dispatchThreads(
      gameSize,
      gameSize,
    );
    lastFramePos = { x: end.x, y: end.y };
  } else {
    lastFramePos = null;
  }

  const shouldStep = !paused && (timestamp - lastStepTime >= minTimestepMs);
  if (shouldStep) {
    stepOnce(timestamp);
  }

  const displayBg = displayBindGroups[1 - even];

  displayPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(displayBg)
    .draw(3);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// #region Example controls & Cleanup

export const controls = {
  size: {
    initial: '64',
    options: [16, 32, 64, 128, 256, 512, 1024, 2048, 4096].map((x) =>
      x.toString()
    ),
    onSelectChange: (value: string) => {
      recreateResources(Number.parseInt(value));
    },
  },
  pipeline: {
    initial: 'tiled',
    options: ['tiled', 'naive'],
    onSelectChange: (value: 'tiled' | 'naive') => {
      chosenPipeline = value;
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
