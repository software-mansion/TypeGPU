import tgpu, { common, d, std } from 'typegpu';
import { distanceFrag } from './visualization.ts';
import {
  BrushParams,
  type DistanceTexture,
  distSampleLayout,
  distWriteLayout,
  type FloodTexture,
  initFromMaskLayout,
  initLayout,
  maskLayout,
  type MaskTexture,
  paramsAccess,
  pingPongLayout,
  SampleResult,
  VisualizationParams,
} from './types.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({ canvas });

let brushSize = 1;
let isDrawing = false;
let lastDrawPos: { x: number; y: number } | null = null;
let sourceIdx = 0;
let resolutionScale = 0.5;

let [width, height] = [0, 0];

function updateDimensions() {
  [width, height] = [canvas.width, canvas.height]
    .map((v) => Math.floor(v * resolutionScale));
}
updateDimensions();

const offsetUniform = root.createUniform(d.i32);

const brushUniform = root.createUniform(BrushParams, {
  center: d.vec2f(),
  radius: brushSize,
  erasing: 0,
});

const paramsUniform = root.createUniform(VisualizationParams, {
  showInside: 0,
  showOutside: 1,
});

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

function createResources() {
  const textures = [0, 1].map(() =>
    root['~unstable']
      .createTexture({
        size: [width, height],
        format: 'rgba16float',
      })
      .$usage('storage')
  ) as [FloodTexture, FloodTexture];

  const maskTexture = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'r32uint',
    })
    .$usage('storage') as MaskTexture;

  const distanceTexture = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled') as DistanceTexture;

  const initBindGroups = textures.map((tex) =>
    root.createBindGroup(initLayout, { writeView: tex })
  );

  const pingPongBindGroups = [0, 1].map((i) =>
    root.createBindGroup(pingPongLayout, {
      readView: textures[i],
      writeView: textures[1 - i],
    })
  );

  const renderBindGroups = [0].map(() =>
    root.createBindGroup(distSampleLayout, {
      distTexture: distanceTexture.createView(),
      sampler: filteringSampler,
    })
  );

  const maskBindGroup = root.createBindGroup(maskLayout, {
    maskTexture: maskTexture,
  });

  const distWriteBindGroup = root.createBindGroup(distWriteLayout, {
    distTexture: distanceTexture,
  });

  const initFromMaskBindGroup = root.createBindGroup(initFromMaskLayout, {
    maskTexture: maskTexture,
    writeView: textures[0],
  });

  return {
    textures,
    maskTexture,
    distanceTexture,
    initBindGroups,
    pingPongBindGroups,
    renderBindGroups,
    maskBindGroup,
    distWriteBindGroup,
    initFromMaskBindGroup,
  };
}

let resources = createResources();

const sampleWithOffset = (
  tex: d.textureStorage2d<'rgba16float', 'read-only'>,
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
  const loaded = std.textureLoad(tex, safePos);

  const inside = loaded.xy;
  const outside = loaded.zw;

  return SampleResult({
    inside: std.select(inside, d.vec2f(-1), outOfBounds),
    outside: std.select(outside, d.vec2f(-1), outOfBounds),
  });
};

const initFromMask = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const size = std.textureDimensions(initFromMaskLayout.$.writeView);
  const pos = d.vec2f(x, y);
  const uv = pos.div(d.vec2f(size));

  const mask = std.textureLoad(
    initFromMaskLayout.$.maskTexture,
    d.vec2i(x, y),
  ).x;

  const inside = mask > 0;
  const invalid = d.vec2f(-1);

  const insideCoord = std.select(invalid, uv, inside);
  const outsideCoord = std.select(uv, invalid, inside);

  std.textureStore(
    initFromMaskLayout.$.writeView,
    d.vec2i(x, y),
    d.vec4f(insideCoord, outsideCoord),
  );
});

const jumpFlood = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const offset = offsetUniform.$;
  const size = std.textureDimensions(pingPongLayout.$.readView);
  const pos = d.vec2f(x, y);

  let bestInsideCoord = d.vec2f(-1);
  let bestOutsideCoord = d.vec2f(-1);
  let bestInsideDist = 1e20;
  let bestOutsideDist = 1e20;

  for (const dx of tgpu.unroll([-1, 0, 1])) {
    for (const dy of tgpu.unroll([-1, 0, 1])) {
      const sample = sampleWithOffset(
        pingPongLayout.$.readView,
        d.vec2i(x, y),
        d.vec2i(dx * offset, dy * offset),
      );

      if (sample.inside.x >= 0) {
        const dInside = std.distance(
          pos,
          sample.inside.mul(d.vec2f(size)),
        );
        if (dInside < bestInsideDist) {
          bestInsideDist = dInside;
          bestInsideCoord = d.vec2f(sample.inside);
        }
      }

      if (sample.outside.x >= 0) {
        const dOutside = std.distance(
          pos,
          sample.outside.mul(d.vec2f(size)),
        );
        if (dOutside < bestOutsideDist) {
          bestOutsideDist = dOutside;
          bestOutsideCoord = d.vec2f(sample.outside);
        }
      }
    }
  }

  std.textureStore(
    pingPongLayout.$.writeView,
    d.vec2i(x, y),
    d.vec4f(bestInsideCoord, bestOutsideCoord),
  );
});

const drawSeed = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const brushParams = brushUniform.$;
  const pos = d.vec2f(x, y);
  const inBrush = std.distance(pos, brushParams.center) <= brushParams.radius;

  if (!inBrush) {
    return;
  }

  std.textureStore(
    maskLayout.$.maskTexture,
    d.vec2i(x, y),
    d.vec4u(std.select(d.u32(0), 1, brushParams.erasing === 0), 0, 0, 0),
  );
});

const createDistanceField = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const pos = d.vec2f(x, y);
  const size = std.textureDimensions(pingPongLayout.$.readView);
  const texel = std.textureLoad(
    pingPongLayout.$.readView,
    d.vec2i(x, y),
  );

  const insideCoord = texel.xy;
  const outsideCoord = texel.zw;

  let insideDist = 1e20;
  let outsideDist = 1e20;

  if (insideCoord.x >= 0) {
    insideDist = std.distance(pos, insideCoord.mul(d.vec2f(size)));
  }

  if (outsideCoord.x >= 0) {
    outsideDist = std.distance(pos, outsideCoord.mul(d.vec2f(size)));
  }

  const signedDist = insideDist - outsideDist;

  std.textureStore(
    distWriteLayout.$.distTexture,
    d.vec2i(x, y),
    d.vec4f(signedDist, 0, 0, 0),
  );
});

const distancePipeline = root
  .with(paramsAccess, paramsUniform)
  .createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: distanceFrag,
    targets: { format: presentationFormat },
  });

function swap() {
  sourceIdx ^= 1;
}

function render() {
  distancePipeline
    .with(resources.renderBindGroups[0])
    .withColorAttachment({ view: context })
    .draw(3);
}

function runFlood() {
  initFromMask
    .with(resources.initFromMaskBindGroup)
    .dispatchThreads(width, height);

  sourceIdx = 0;

  const maxRange = Math.floor(Math.max(width, height) / 2);
  let offset = maxRange;

  while (offset >= 1) {
    offsetUniform.write(offset);
    jumpFlood
      .with(resources.pingPongBindGroups[sourceIdx])
      .dispatchThreads(
        width,
        height,
      );
    swap();
    offset = Math.floor(offset / 2);
  }

  createDistanceField
    .with(resources.pingPongBindGroups[sourceIdx])
    .with(resources.distWriteBindGroup)
    .dispatchThreads(width, height);

  render();
}

function drawAtPosition(
  canvasX: number,
  canvasY: number,
) {
  const rect = canvas.getBoundingClientRect();
  brushUniform.writePartial({
    center: d.vec2f(
      canvasX * width / rect.width,
      canvasY * height / rect.height,
    ),
  });
  drawSeed.with(resources.maskBindGroup).dispatchThreads(width, height);
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
  runFlood();
}

function clearCanvas() {
  resources.maskTexture.clear();
  sourceIdx = 0;
  runFlood();
}

function recreateResources() {
  for (const t of resources.textures) {
    t.destroy();
  }
  resources.maskTexture.destroy();
  resources.distanceTexture.destroy();
  updateDimensions();
  resources = createResources();
  sourceIdx = 0;
}

clearCanvas();

function getTouchPosition(rect: DOMRect, touches: TouchList) {
  if (touches.length === 2) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
  }
  return {
    x: touches[0].clientX - rect.left,
    y: touches[0].clientY - rect.top,
  };
}

// #region Example controls & Cleanup

let resizeTimeout: ReturnType<typeof setTimeout>;
const resizeObserver = new ResizeObserver(() => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    recreateResources();
    clearCanvas();
  }, 100);
});
resizeObserver.observe(canvas);

const onMouseDown = (e: MouseEvent) => {
  if (e.button !== 0 && e.button !== 2) {
    return;
  }
  brushUniform.writePartial({ erasing: e.button === 2 ? 1 : 0 });
  isDrawing = true;
  lastDrawPos = null;
  const rect = canvas.getBoundingClientRect();
  interpolateAndDraw(e.clientX - rect.left, e.clientY - rect.top);
};

const onMouseMove = (e: MouseEvent) => {
  if (!isDrawing) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  interpolateAndDraw(e.clientX - rect.left, e.clientY - rect.top);
};

const onMouseUp = () => {
  isDrawing = false;
  lastDrawPos = null;
};

const onTouchStart = (e: TouchEvent) => {
  isDrawing = true;
  lastDrawPos = null;
  const rect = canvas.getBoundingClientRect();
  brushUniform.writePartial({ erasing: e.touches.length === 2 ? 1 : 0 });
  const pos = getTouchPosition(rect, e.touches);
  interpolateAndDraw(pos.x, pos.y);
};

const onTouchMove = (e: TouchEvent) => {
  if (!isDrawing) {
    return;
  }
  e.preventDefault();
  brushUniform.writePartial({ erasing: e.touches.length === 2 ? 1 : 0 });
  const rect = canvas.getBoundingClientRect();
  const pos = getTouchPosition(rect, e.touches);
  interpolateAndDraw(pos.x, pos.y);
};

const onTouchEnd = () => {
  isDrawing = false;
  lastDrawPos = null;
};

canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('mouseleave', onMouseUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('touchstart', onTouchStart);
canvas.addEventListener('touchmove', onTouchMove, { passive: false });
canvas.addEventListener('touchend', onTouchEnd);
canvas.addEventListener('touchcancel', onTouchEnd);

function updateBrushSize() {
  brushUniform.writePartial({
    radius: Math.ceil(Math.min(width, height) * brushSize),
  });
}

export const controls = defineControls({
  Clear: {
    onButtonClick: clearCanvas,
  },
  'Brush size': {
    initial: 0.05,
    min: 0.01,
    max: 0.2,
    step: 0.01,
    onSliderChange(value: number) {
      brushSize = value;
      updateBrushSize();
    },
  },
  'Show positive distance': {
    initial: true,
    onToggleChange(value: boolean) {
      paramsUniform.writePartial({ showOutside: value ? 1 : 0 });
      render();
    },
  },
  'Show negative distance': {
    initial: false,
    onToggleChange(value: boolean) {
      paramsUniform.writePartial({ showInside: value ? 1 : 0 });
      render();
    },
  },
  'Resolution scale': {
    initial: '50%',
    options: ['100%', '50%', '20%', '10%', '5%', '2%'],
    onSelectChange(value: string) {
      resolutionScale = Number.parseFloat(value) / 100;
      recreateResources();
      clearCanvas();
      updateBrushSize();
    },
  },
});

export function onCleanup() {
  clearTimeout(resizeTimeout);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
