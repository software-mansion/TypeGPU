import { sdLine } from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const CellKind = {
  empty: 0,
  wall: 1,
  source: 2,
  drain: 3,
} as const;

const BrushTypes = ['wall', 'source', 'drain', 'water'] as const;
type BrushType = (typeof BrushTypes)[number];

const WATER_BRUSH_LEVEL = 100;
const SOURCE_RATE = tgpu.const(d.u32, 20);
const MAX_WATER_LEVEL_UNPRESSURIZED = tgpu.const(d.u32, 0xff);
const MAX_WATER_LEVEL = tgpu.const(d.u32, (1 << 24) - 1);
const MAX_PRESSURE = tgpu.const(d.u32, 12);

const BrushConfig = {
  wall: { cellKind: CellKind.wall, waterAmount: 0 },
  source: { cellKind: CellKind.source, waterAmount: 0 },
  drain: { cellKind: CellKind.drain, waterAmount: 0 },
  water: { cellKind: CellKind.empty, waterAmount: WATER_BRUSH_LEVEL },
} as const;

const WaterArray = d.arrayOf(d.u32);
const AtomicWaterArray = d.arrayOf(d.atomic(d.u32));
const FlagsArray = d.arrayOf(d.u32);

const SimParams = d.struct({
  resolution: d.vec2u,
  viscosity: d.u32,
});

const stateLayout = tgpu.bindGroupLayout({
  flags: { storage: FlagsArray, access: 'readonly' },
  currentWater: { storage: WaterArray, access: 'readonly' },
  nextWater: { storage: AtomicWaterArray, access: 'mutable' },
});

const brushStateLayout = tgpu.bindGroupLayout({
  flags: { storage: FlagsArray, access: 'mutable' },
  currentWater: { storage: WaterArray, access: 'mutable' },
  nextWater: { storage: AtomicWaterArray, access: 'mutable' },
});

const simParams = root.createUniform(SimParams);

const BrushParams = d.struct({
  start: d.vec2f,
  end: d.vec2f,
  radius: d.f32,
  cellKind: d.u32,
  waterAmount: d.u32,
  erasing: d.u32,
});

const brushParams = root.createUniform(BrushParams);

const options = {
  size: 32,
  timestep: 25,
  stepsPerTimestep: 1,
  viscosity: 1000,
  brushSize: 0,
  brushType: 'water' as BrushType,
};

const getIndex = (coord: d.v2u): number => {
  'use gpu';
  return coord.y * simParams.$.resolution.x + coord.x;
};

const isInBounds = (coord: d.v2u): boolean => {
  'use gpu';
  return coord.x < simParams.$.resolution.x && coord.y < simParams.$.resolution.y;
};

const isBoundary = (coord: d.v2u): boolean => {
  'use gpu';
  return (
    coord.x === 0 ||
    coord.y === 0 ||
    coord.x === simParams.$.resolution.x - 1 ||
    coord.y === simParams.$.resolution.y - 1
  );
};

const getFlags = (coord: d.v2u): number => {
  'use gpu';
  return stateLayout.$.flags[getIndex(coord)];
};

const getWaterLevel = (coord: d.v2u): number => {
  'use gpu';
  return stateLayout.$.currentWater[getIndex(coord)];
};

const isFlowBlocked = (coord: d.v2u): boolean => {
  'use gpu';
  return !isInBounds(coord) || getFlags(coord) === CellKind.wall;
};

const isDrainTarget = (coord: d.v2u): boolean => {
  'use gpu';
  return !isInBounds(coord) || getFlags(coord) === CellKind.drain || isBoundary(coord);
};

const canStoreWater = (coord: d.v2u): boolean => {
  'use gpu';
  return !isDrainTarget(coord) && getFlags(coord) !== CellKind.wall;
};

const getTargetWaterLevel = (coord: d.v2u): number => {
  'use gpu';
  if (isDrainTarget(coord)) {
    return d.u32(0);
  }

  return getWaterLevel(coord);
};

const addNextWater = (coord: d.v2u, amount: number) => {
  'use gpu';
  if (amount === 0 || !canStoreWater(coord)) {
    return;
  }

  const index = getIndex(coord);
  const previous = std.atomicAdd(stateLayout.$.nextWater[index], amount);
  if (previous > MAX_WATER_LEVEL.$) {
    std.atomicMin(stateLayout.$.nextWater[index], MAX_WATER_LEVEL.$);
    return;
  }

  if (amount > MAX_WATER_LEVEL.$ - previous) {
    std.atomicMin(stateLayout.$.nextWater[index], MAX_WATER_LEVEL.$);
  }
};

const subtractNextWater = (coord: d.v2u, amount: number) => {
  'use gpu';
  if (amount === 0) {
    return;
  }

  std.atomicSub(stateLayout.$.nextWater[getIndex(coord)], amount);
};

const clearNextWater = (coord: d.v2u) => {
  'use gpu';
  std.atomicStore(stateLayout.$.nextWater[getIndex(coord)], d.u32(0));
};

const applyFlow = (source: d.v2u, target: d.v2u, amount: number) => {
  'use gpu';
  subtractNextWater(source, amount);

  if (!isDrainTarget(target)) {
    addNextWater(target, amount);
  }
};

const getStableStateBelow = (upper: number, lower: number): number => {
  'use gpu';
  const totalMass = upper + lower;
  if (totalMass <= MAX_WATER_LEVEL_UNPRESSURIZED.$) {
    return totalMass;
  }
  if (totalMass >= MAX_WATER_LEVEL_UNPRESSURIZED.$ * 2 && upper > lower) {
    return d.u32(totalMass / 2) + MAX_PRESSURE.$;
  }
  return MAX_WATER_LEVEL_UNPRESSURIZED.$;
};

const handleCellFlags = (coord: d.v2u): boolean => {
  'use gpu';
  const flags = getFlags(coord);

  if (flags === CellKind.wall || flags === CellKind.drain || isBoundary(coord)) {
    clearNextWater(coord);
    return true;
  }

  if (flags === CellKind.source) {
    addNextWater(coord, SOURCE_RATE.$);
  }

  return false;
};

const flowDown = (coord: d.v2u, remainingWater: d.ref<number>) => {
  'use gpu';
  if (remainingWater.$ === 0 || coord.y === 0) {
    return;
  }

  const target = d.vec2u(coord.x, coord.y - 1);
  if (isFlowBlocked(target)) {
    return;
  }

  const targetWater = getTargetWaterLevel(target);
  const stable = getStableStateBelow(remainingWater.$, targetWater);
  if (targetWater >= stable) {
    return;
  }

  const flow = std.min(stable - targetWater, simParams.$.viscosity);
  applyFlow(coord, target, flow);
  remainingWater.$ -= flow;
};

const flowSidewaysTo = (
  coord: d.v2u,
  target: d.v2u,
  remainingWater: d.ref<number>,
  waterLevelBefore: number,
) => {
  'use gpu';
  if (remainingWater.$ === 0) {
    return;
  }

  if (isFlowBlocked(target)) {
    return;
  }

  const flowRaw = d.i32(waterLevelBefore) - d.i32(getTargetWaterLevel(target));
  if (flowRaw <= 0) {
    return;
  }

  const change = std.max(std.min(d.u32(4), remainingWater.$), d.u32(flowRaw / 4));
  const flow = std.min(change, simParams.$.viscosity);
  applyFlow(coord, target, flow);
  remainingWater.$ -= flow;
};

const flowLeft = (coord: d.v2u, remainingWater: d.ref<number>, waterLevelBefore: number) => {
  'use gpu';
  if (coord.x === 0) {
    return;
  }

  flowSidewaysTo(coord, d.vec2u(coord.x - 1, coord.y), remainingWater, waterLevelBefore);
};

const flowRight = (coord: d.v2u, remainingWater: d.ref<number>, waterLevelBefore: number) => {
  'use gpu';
  if (coord.x >= simParams.$.resolution.x - 1) {
    return;
  }

  flowSidewaysTo(coord, d.vec2u(coord.x + 1, coord.y), remainingWater, waterLevelBefore);
};

const flowUp = (coord: d.v2u, remainingWater: d.ref<number>) => {
  'use gpu';
  if (remainingWater.$ === 0 || coord.y >= simParams.$.resolution.y - 1) {
    return;
  }

  const target = d.vec2u(coord.x, coord.y + 1);
  if (isFlowBlocked(target)) {
    return;
  }

  const stable = getStableStateBelow(getTargetWaterLevel(target), remainingWater.$);
  if (stable >= remainingWater.$) {
    return;
  }

  const flow = std.min(remainingWater.$ - stable, simParams.$.viscosity);
  applyFlow(coord, target, flow);
  remainingWater.$ -= flow;
};

const simulationPipeline = root.createGuardedComputePipeline((x: number, y: number) => {
  'use gpu';
  const coord = d.vec2u(x, y);
  if (handleCellFlags(coord)) {
    return;
  }

  const remainingWater = d.ref(getWaterLevel(coord));
  if (remainingWater.$ === 0) {
    return;
  }

  flowDown(coord, remainingWater);

  const waterLevelBefore = remainingWater.$;
  flowLeft(coord, remainingWater, waterLevelBefore);
  flowRight(coord, remainingWater, waterLevelBefore);

  flowUp(coord, remainingWater);
});

const brushPipeline = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const brushPoint = d.vec2f(x, y);
  const brush = brushParams.$;
  let brushDistance = d.f32(0);
  if (brush.start.x === brush.end.x && brush.start.y === brush.end.y) {
    brushDistance = std.distance(brushPoint, brush.start);
  } else {
    brushDistance = sdLine(brushPoint, brush.start, brush.end);
  }

  if (brushDistance > brush.radius) {
    return;
  }

  const index = getIndex(d.vec2u(x, y));
  if (brush.erasing !== 0) {
    brushStateLayout.$.flags[index] = CellKind.empty;
    brushStateLayout.$.currentWater[index] = 0;
    std.atomicStore(brushStateLayout.$.nextWater[index], 0);
    return;
  }

  if (brush.waterAmount !== 0) {
    if (brushStateLayout.$.flags[index] === CellKind.empty) {
      brushStateLayout.$.currentWater[index] = brush.waterAmount;
      std.atomicStore(brushStateLayout.$.nextWater[index], brush.waterAmount);
    }
    return;
  }

  brushStateLayout.$.flags[index] = brush.cellKind;
  brushStateLayout.$.currentWater[index] = 0;
  std.atomicStore(brushStateLayout.$.nextWater[index], 0);
});

const coordFromUv = (uv: d.v2f): d.v2u => {
  'use gpu';
  const clampedUv = std.saturate(uv);
  const gridUv = d.vec2f(clampedUv.x, 1 - clampedUv.y);
  const resolution = d.vec2f(simParams.$.resolution);
  return d.vec2u(std.min(gridUv * resolution, resolution - 1));
};

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const coord = coordFromUv(uv);
    const flags = getFlags(coord);

    if (flags === CellKind.wall) {
      return d.vec4f(0.5, 0.5, 0.5, 1);
    }
    if (flags === CellKind.source) {
      return d.vec4f(0, 1, 0, 1);
    }
    if (flags === CellKind.drain) {
      return d.vec4f(1, 0, 0, 1);
    }

    const normalized = std.min(getWaterLevel(coord) / 0xff, 1);
    if (normalized === 0) {
      return d.vec4f();
    }

    const water = 1 / (1 + std.exp(-(normalized - 0.2) * 10));
    return d.vec4f(0, 0, water, water);
  },
});

type GridPoint = { x: number; y: number };

function writeSimParams() {
  simParams.write({
    resolution: d.vec2u(options.size, options.size),
    viscosity: options.viscosity,
  });
}

function createGridState(size: number) {
  const cellCount = size * size;
  const flagsBuffer = root.createBuffer(FlagsArray(cellCount)).$usage('storage');
  const currentWaterBuffer = root.createBuffer(WaterArray(cellCount)).$usage('storage');
  const nextWaterBuffer = root.createBuffer(AtomicWaterArray(cellCount)).$usage('storage');

  const bindGroup = root.createBindGroup(stateLayout, {
    flags: flagsBuffer,
    currentWater: currentWaterBuffer,
    nextWater: nextWaterBuffer,
  });
  const brushBindGroup = root.createBindGroup(brushStateLayout, {
    flags: flagsBuffer,
    currentWater: currentWaterBuffer,
    nextWater: nextWaterBuffer,
  });

  return {
    flagsBuffer,
    currentWaterBuffer,
    nextWaterBuffer,
    bindGroup,
    brushBindGroup,
  };
}

let gridState: ReturnType<typeof createGridState> | null = null;
let msSinceLastTick = 0;

function destroyGridState() {
  gridState?.flagsBuffer.destroy();
  gridState?.currentWaterBuffer.destroy();
  gridState?.nextWaterBuffer.destroy();
  gridState = null;
}

function stepSimulation() {
  if (!gridState) {
    return;
  }

  simulationPipeline.with(gridState.bindGroup).dispatchThreads(options.size, options.size);
  gridState.currentWaterBuffer.copyFrom(gridState.nextWaterBuffer);
}

function drawFrame() {
  if (!gridState) {
    return;
  }

  renderPipeline.with(gridState.bindGroup).withColorAttachment({ view: context }).draw(3);
}

function applyBrushStroke(
  start: GridPoint,
  end: GridPoint,
  radius: number,
  brushType: BrushType,
  erasing = false,
) {
  if (!gridState) {
    return;
  }

  const brushConfig = BrushConfig[brushType];
  brushParams.write({
    start: d.vec2f(start.x, start.y),
    end: d.vec2f(end.x, end.y),
    radius,
    cellKind: brushConfig.cellKind,
    waterAmount: brushConfig.waterAmount,
    erasing: erasing ? 1 : 0,
  });
  brushPipeline.with(gridState.brushBindGroup).dispatchThreads(options.size, options.size);
}

function createSampleScene() {
  const middlePoint = Math.floor(options.size / 2);
  const radius = Math.floor(options.size / 8);
  const center = { x: middlePoint, y: middlePoint };
  applyBrushStroke(center, center, radius, 'wall');

  const sourceY = middlePoint + Math.floor(options.size / 4);
  const smallRadius = Math.min(Math.floor(radius / 8), 6);
  const source = { x: middlePoint, y: sourceY };
  applyBrushStroke(source, source, smallRadius, 'source');

  applyBrushStroke({ x: 0, y: 0 }, { x: options.size - 1, y: 0 }, 0.5, 'wall');

  const sideWallTop = Math.floor(options.size / 8) - 1;
  if (sideWallTop >= 0) {
    applyBrushStroke({ x: 0, y: 0 }, { x: 0, y: sideWallTop }, 0.5, 'wall');
    applyBrushStroke(
      { x: options.size - 1, y: 0 },
      { x: options.size - 1, y: sideWallTop },
      0.5,
      'wall',
    );
  }
}

function resetGameData() {
  destroyGridState();
  writeSimParams();
  gridState = createGridState(options.size);
  msSinceLastTick = 0;

  createSampleScene();
  stepSimulation();
  drawFrame();
}

let isDrawing = false;
let isErasing = false;
let longTouchTimeout: number | null = null;
let touchMoved = false;
let lastPoint: { x: number; y: number } | null = null;

const startDrawing = (erase: boolean) => {
  isDrawing = true;
  isErasing = erase;
  lastPoint = null;
};

const stopDrawing = () => {
  isDrawing = false;
  lastPoint = null;
  drawFrame();
  if (longTouchTimeout) {
    clearTimeout(longTouchTimeout);
    longTouchTimeout = null;
  }
};

const pointerCellFromCanvasOffset = (offsetX: number, offsetY: number) => {
  const cellSize = canvas.width / options.size;
  return {
    x: Math.floor((offsetX * window.devicePixelRatio) / cellSize),
    y: options.size - Math.floor((offsetY * window.devicePixelRatio) / cellSize) - 1,
  };
};

const pointerCellFromTouch = (touch: Touch) => {
  const canvasPos = canvas.getBoundingClientRect();
  return pointerCellFromCanvasOffset(touch.clientX - canvasPos.left, touch.clientY - canvasPos.top);
};

const handleDrawing = (x: number, y: number) => {
  const point = { x, y };
  applyBrushStroke(
    lastPoint ?? point,
    point,
    options.brushSize + 0.5,
    options.brushType,
    isErasing,
  );
  lastPoint = point;
  drawFrame();
};

canvas.addEventListener('contextmenu', (event) => {
  if (event.target === canvas) {
    event.preventDefault();
  }
});

canvas.onmousedown = (event) => {
  startDrawing(event.button === 2);
  const cell = pointerCellFromCanvasOffset(event.offsetX, event.offsetY);
  handleDrawing(cell.x, cell.y);
};

canvas.onmouseup = stopDrawing;

canvas.onmousemove = (event) => {
  if (!isDrawing) {
    return;
  }

  const cell = pointerCellFromCanvasOffset(event.offsetX, event.offsetY);
  handleDrawing(cell.x, cell.y);
};

canvas.ontouchstart = (event) => {
  event.preventDefault();
  touchMoved = false;
  const cell = pointerCellFromTouch(event.touches[0]);
  longTouchTimeout = window.setTimeout(() => {
    if (!touchMoved) {
      startDrawing(true);
      handleDrawing(cell.x, cell.y);
    }
  }, 500);
  startDrawing(false);
  handleDrawing(cell.x, cell.y);
};

canvas.ontouchend = (event) => {
  event.preventDefault();
  stopDrawing();
};

canvas.ontouchmove = (event) => {
  event.preventDefault();
  touchMoved = true;
  if (!isDrawing) {
    return;
  }

  const touch = event.touches[0];
  const cell = pointerCellFromTouch(touch);
  handleDrawing(cell.x, cell.y);
};

resetGameData();

// #region UI

let paused = false;

let animationFrame: number;
let lastTime: number | null = null;
function run(timestamp: number) {
  const dt = lastTime !== null ? timestamp - lastTime : 0;
  lastTime = timestamp;
  msSinceLastTick += dt;

  if (msSinceLastTick >= options.timestep) {
    if (!paused) {
      for (let i = 0; i < options.stepsPerTimestep; i++) {
        stepSimulation();
      }
      drawFrame();
    }
    msSinceLastTick -= options.timestep;
  }

  animationFrame = requestAnimationFrame(run);
}
animationFrame = requestAnimationFrame(run);

const detachAutoResizer = common.attachAutoResizer({ root, canvas });

export const controls = defineControls({
  size: {
    initial: 32,
    options: [16, 32, 64, 128, 256, 512, 1024],
    onSelectChange: (value) => {
      options.size = value;
      resetGameData();
    },
  },

  'min timestep (ms)': {
    initial: 25,
    min: 4,
    max: 100,
    step: 1,
    onSliderChange: (value) => {
      options.timestep = value;
    },
  },

  'steps per timestep': {
    initial: 1,
    min: 1,
    max: 200,
    step: 1,
    onSliderChange: (value) => {
      options.stepsPerTimestep = value;
    },
  },

  viscosity: {
    initial: 0,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      options.viscosity = 1000 - value * 990;
      writeSimParams();
    },
  },

  'brush size': {
    initial: 1,
    min: 1,
    max: 10,
    step: 1,
    onSliderChange: (value) => {
      options.brushSize = value - 1;
    },
  },

  'brush type': {
    initial: 'water',
    options: BrushTypes,
    onSelectChange: (value) => {
      options.brushType = value;
    },
  },

  pause: {
    initial: false,
    onToggleChange: (value) => {
      paused = value;
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  detachAutoResizer();
  root.destroy();
}

// #endregion
