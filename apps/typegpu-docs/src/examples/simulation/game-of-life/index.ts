import { randf } from '@typegpu/noise';
import tgpu, { common, d, std } from 'typegpu';
import type {
  SampledFlag,
  StorageFlag,
  TgpuBindGroup,
  TgpuComputeFn,
  TgpuTexture,
} from 'typegpu';
import {
  computeLayout,
  displayLayout,
  gameSizeAccessor,
  TILE_SIZE,
} from './shaders/common.ts';
import { tiledCompute } from './shaders/tiled-compute.ts';
import { naiveCompute } from './shaders/naive-compute.ts';
import { bitpackedCompute } from './shaders/bitpacked-compute.ts';
import { sdLine, sdRoundedBox2d } from '@typegpu/sdf';
import { setupInput } from './input.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init({
  device: { optionalFeatures: ['timestamp-query'] },
});
const hasTimestamp = root.enabledFeatures.has('timestamp-query');
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

let gameSize = 64;
const gameSizeUniform = root.createUniform(d.u32, gameSize);
const timeUniform = root.createUniform(d.f32, 0);
const nearestSampler = root.device.createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
  addressModeU: 'repeat',
  addressModeV: 'repeat',
});

const ZoomParams = d.struct({
  enabled: d.u32,
  level: d.f32,
  centerX: d.f32,
  centerY: d.f32,
});
const zoomUniform = root.createUniform(ZoomParams, {
  enabled: 0,
  level: 1,
  centerX: 0.5,
  centerY: 0.5,
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

const randomInit = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  randf.seed2(d.vec2f(x, y) / d.f32(gameSizeUniform.$) * timeUniform.$);
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
let brushRadius = 0.02;
let brushMode: 0 | 1 | 2 = 2;
const input = setupInput(canvas);
const brushStrokeUniform = root.createUniform(BrushStroke, {
  start: d.vec2f(0.5),
  end: d.vec2f(0.5),
  radius: brushRadius,
  mode: brushMode,
});

const getBrushRadius = (radiusNorm: number, gameSize: number) => {
  'use gpu';
  const halfPixelRadius = 0.5 / gameSize;
  const maxRadius = std.sqrt(2);
  return std.mix(halfPixelRadius, maxRadius, radiusNorm);
};

const handleDraw = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const uv = (d.vec2f(x, y) + 0.5) / d.f32(gameSizeUniform.$);
  const stroke = brushStrokeUniform.$;
  randf.seed2(d.vec2f(x, y) / d.f32(gameSizeUniform.$) * timeUniform.$);
  if (
    sdLine(uv, stroke.start, stroke.end) <=
      getBrushRadius(stroke.radius, gameSizeAccessor.$)
  ) {
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

const handleDrawBitpacked = root.createGuardedComputePipeline((px, py) => {
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
    const cellX = d.f32(d.u32(px) * d.u32(32) + d.u32(i)) + 0.5;
    const cellY = d.f32(py) + 0.5;
    const uv = d.vec2f(cellX, cellY) / gs;

    if (
      sdLine(uv, stroke.start, stroke.end) <=
        getBrushRadius(stroke.radius, gs)
    ) {
      const bit = d.u32(1) << d.u32(i);
      affectedMask = affectedMask | bit;

      if (stroke.mode === d.u32(0)) {
        // Add mode: set bit
        newValues = newValues | bit;
      } else if (stroke.mode === d.u32(2)) {
        // Random mode
        randf.seed2(d.vec2f(cellX, cellY) / gs * timeUniform.$);
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
});

const perf = { sum: 0, count: 0, window: 120 };

function createPipeline(name: string, compute: TgpuComputeFn) {
  const base = root
    .with(gameSizeAccessor, gameSizeUniform)
    .createComputePipeline({ compute });

  return !hasTimestamp ? base : base
    .withPerformanceCallback((start, end) => {
      perf.sum += Number(end - start) / 1_000_00;
      perf.count++;
      if (perf.count >= perf.window) {
        console.log(
          `${name}: ${
            (perf.sum / perf.count).toFixed(3)
          }ms average over ${perf.window} frames`,
        );
        perf.sum = 0;
        perf.count = 0;
      }
    });
}

const computePipelines = {
  tiled: createPipeline('Tiled', tiledCompute),
  naive: createPipeline('Naive', naiveCompute),
  bitpacked: createPipeline('Bitpacked', bitpackedCompute),
};

const sampleRegular = (sampleUv: d.v2f, gs: number): number => {
  'use gpu';
  return std.textureLoad(
    displayLayout.$.source,
    d.vec2u(sampleUv * gs),
  ).x;
};

const sampleBitpacked = (sampleUv: d.v2f, gs: number): number => {
  'use gpu';
  const pixelCoord = sampleUv * gs;
  const cellX = d.u32(pixelCoord.x);
  const cellY = d.u32(pixelCoord.y);
  const packedX = cellX / 32;
  const bitIndex = cellX % 32;
  const packed = std.textureLoad(
    displayLayout.$.source,
    d.vec2u(packedX, cellY),
  ).x;
  return (packed >> bitIndex) & d.u32(1);
};

const cellSamplerSlot = tgpu.slot<(uv: d.v2f, gs: number) => number>(
  sampleRegular,
);

const viewModeUniform = root.createUniform(d.u32, 0); // 0 = colorful, 1 = classic

const displayFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const zoom = zoomUniform.$;
  const gs = d.f32(gameSizeUniform.$);

  const halfView = 0.5 / zoom.level;
  const clampedCenter = std.clamp(
    d.vec2f(zoom.centerX, zoom.centerY),
    d.vec2f(halfView),
    d.vec2f(1 - halfView),
  );

  const minimapMin = d.vec2f(0.78, 0.78);
  const minimapMax = d.vec2f(0.98, 0.98);
  const minimapSize = 0.2;

  const inMinimap = zoom.enabled === 1 &&
    uv.x >= minimapMin.x && uv.x <= minimapMax.x &&
    uv.y >= minimapMin.y && uv.y <= minimapMax.y;

  if (inMinimap) {
    const localUv = (uv - minimapMin) / minimapSize;

    // Outer border
    const edgeDist = sdRoundedBox2d(localUv - 0.5, d.vec2f(0.5), 0.02);
    if (edgeDist > -0.02) {
      const alpha = 1.0 - std.smoothstep(0.0, 0.02, edgeDist);
      return d.vec4f(0.5, 0.5, 0.5, alpha);
    }

    // View rectangle highlight
    const viewSize = 1 / zoom.level;
    const dist = sdRoundedBox2d(
      localUv - clampedCenter,
      d.vec2f(viewSize / 2),
      0.01,
    );

    const borderWidth = 0.015;
    if (dist > -borderWidth && dist < borderWidth) {
      const borderColor = std.mix(
        d.vec4f(0.769, 0.392, 1.0, 1.0),
        d.vec4f(0.114, 0.447, 0.941, 1.0),
        localUv.x,
      );
      const a = 1.0 - std.smoothstep(0.0, borderWidth, std.abs(dist));
      return d.vec4f(borderColor.x, borderColor.y, borderColor.z, a);
    }

    const value = cellSamplerSlot.$(localUv, gs);
    const alive = std.select(
      d.vec4f(localUv.x / 2.5, localUv.y / 2.5, (1 - localUv.x) / 2.5, 0.8),
      d.vec4f(0.6, 0.6, 0.6, 0.8),
      viewModeUniform.$ === 1,
    );
    return std.select(d.vec4f(0, 0, 0, 0.8), alive, value === 1);
  }

  let sampleUv = d.vec2f(uv);
  if (zoom.enabled === 1) {
    sampleUv = (uv - 0.5) / zoom.level + clampedCenter;
  }

  const value = cellSamplerSlot.$(sampleUv, gs);
  const isClassic = viewModeUniform.$ === 1;
  const alive = std.select(
    std.normalize(
      d.vec4f(sampleUv.x / 1.5, sampleUv.y / 1.5, 1 - sampleUv.x / 1.5, 1),
    ),
    d.vec4f(1),
    isClassic,
  );
  const dead = std.select(d.vec4f(0), d.vec4f(0, 0, 0, 1), isClassic);

  return std.select(dead, alive, value === 1);
});

const [displayPipeline, bitpackedDisplayPipeline] = [
  sampleRegular,
  sampleBitpacked,
].map((fn) =>
  root
    .with(cellSamplerSlot, fn)
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: displayFragment,
    })
);

const bitpackedRandomInit = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  let packed = d.u32(0);
  for (let i = 0; i < 32; i++) {
    randf.seed2(
      d.vec2f(d.f32(x) * 32 + d.f32(i), y) /
        d.f32(gameSizeUniform.$) *
        timeUniform.$,
    );
    packed = packed |
      (std.select(d.u32(0), d.u32(1), randf.sample() > 0.5) << d.u32(i));
  }
  std.textureStore(
    computeLayout.$.next,
    d.vec2u(x, y),
    d.vec4u(packed, 0, 0, 0),
  );
});

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

let paused = false;
let minTimestepMs = 0;
let lastStepTime = 0;
let stepsPerTimestep = 1;

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
  const isZoomed = input.zoomLevel > 1;
  zoomUniform.write({
    enabled: isZoomed ? 1 : 0,
    level: input.zoomLevel,
    centerX: input.zoomCenter.x,
    centerY: input.zoomCenter.y,
  });

  if (input.drawPos) {
    const start = input.lastDrawPos ?? input.drawPos;
    const end = input.drawPos;
    brushStrokeUniform.write({
      start: d.vec2f(start.x, start.y),
      end: d.vec2f(end.x, end.y),
      radius: brushRadius,
      mode: brushMode,
    });

    const [pipeline, [x, y], swap] = chosenPipeline === 'bitpacked'
      ? [handleDrawBitpacked, [gameSize / 32, gameSize], true]
      : [handleDraw, [gameSize, gameSize], false];

    // Bitpacked version reads current state to avoid overwriting unaffected cells
    if (swap) {
      even ^= 1;
    }

    pipeline
      .with(computeBindGroups[even])
      .dispatchThreads(x, y);

    input.lastDrawPos = { x: end.x, y: end.y };
  } else {
    input.lastDrawPos = null;
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
    .withColorAttachment({ view: context })
    .with(displayBindGroups[1 - even])
    .draw(3);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// #region Example controls & Cleanup

export const controls = defineControls({
  size: {
    initial: '1024',
    options: [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192].map((x) =>
      x.toString()
    ),
    onSelectChange: (value: string) => {
      recreateResources(Number.parseInt(value));
    },
  },
  pipeline: {
    initial: 'bitpacked',
    options: ['tiled', 'naive', 'bitpacked'],
    onSelectChange: (value: 'tiled' | 'naive' | 'bitpacked') => {
      const wasBitpacked = chosenPipeline === 'bitpacked';
      const isBitpacked = value === 'bitpacked';
      chosenPipeline = value;
      perf.sum = 0;
      perf.count = 0;
      if (wasBitpacked !== isBitpacked) {
        recreateResources(gameSize);
      }
    },
  },
  view: {
    initial: 'colorful',
    options: ['colorful', 'classic'],
    onSelectChange: (value: string) => {
      viewModeUniform.write(value === 'classic' ? 1 : 0);
    },
  },
  'brush radius': {
    initial: 0.02,
    min: 0,
    max: 1,
    step: 0.001,
    onSliderChange: (value: number) => {
      brushRadius = value;
    },
  },
  'brush mode': {
    initial: 'random',
    options: ['add', 'delete', 'random'],
    onSelectChange: (value: 'add' | 'delete' | 'random') => {
      brushMode = value === 'add' ? 0 : value === 'delete' ? 1 : 2;
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
  'zoom sensitivity': {
    initial: 0.3,
    min: 0.01,
    max: 1,
    step: 0.01,
    onSliderChange: (value: number) => {
      input.zoomSensitivity = value;
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
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick() {
      // bitpacked is done by default
      [computePipelines.naive, computePipelines.tiled]
        .map((pipeline) => tgpu.resolve([pipeline]))
        .map((code) => root.device.createShaderModule({ code }));
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
