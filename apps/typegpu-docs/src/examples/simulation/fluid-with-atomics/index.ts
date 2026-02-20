import tgpu, { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

canvas.addEventListener('contextmenu', (event) => {
  if (event.target === canvas) {
    event.preventDefault();
  }
});

const MAX_WATER_LEVEL_UNPRESSURIZED = tgpu.const(d.u32, 0xff);
const MAX_WATER_LEVEL = tgpu.const(d.u32, (1 << 24) - 1);
const MAX_PRESSURE = tgpu.const(d.u32, 12);

const options = {
  size: 32,
  timestep: 25,
  stepsPerTimestep: 1,
  workgroupSize: 1,
  viscosity: 1000,
  brushSize: 0,
  brushType: 'water',
};

const BrushTypes = ['wall', 'source', 'drain', 'water'];
function encodeBrushType(brushType: (typeof BrushTypes)[number]) {
  switch (brushType) {
    case 'wall':
      return 1 << 24;
    case 'source':
      return 2 << 24;
    case 'drain':
      return 3 << 24;
    default:
      return 100;
  }
}

const size = root.createUniform(d.vec2u);
const viscosity = root.createUniform(d.u32);

const currentStateBuffer = root
  .createBuffer(d.arrayOf(d.u32, 1024 ** 2))
  .$usage('storage', 'vertex');
const currentStateStorage = currentStateBuffer.as('readonly');

const nextState = root.createMutable(d.arrayOf(d.atomic(d.u32), 1024 ** 2));

const squareBuffer = root
  .createBuffer(d.arrayOf(d.vec2f, 4), [
    d.vec2f(0, 0),
    d.vec2f(0, 1),
    d.vec2f(1, 0),
    d.vec2f(1, 1),
  ])
  .$usage('vertex');

const getIndex = tgpu.fn([d.u32, d.u32], d.u32)((x, y) => {
  const h = size.$.y;
  const w = size.$.x;
  return (y % h) * w + (x % w);
});

const getCell = tgpu.fn([d.u32, d.u32], d.u32)((x, y) =>
  currentStateStorage.$[getIndex(x, y)]
);

const getCellNext = tgpu.fn([d.u32, d.u32], d.u32)((x, y) =>
  std.atomicLoad(nextState.$[getIndex(x, y)])
);

const updateCell = tgpu.fn([d.u32, d.u32, d.u32])((x, y, value) => {
  std.atomicStore(nextState.$[getIndex(x, y)], value);
});

const addToCell = tgpu.fn([d.u32, d.u32, d.u32])((x, y, value) => {
  const cell = getCellNext(x, y);
  const waterLevel = cell & MAX_WATER_LEVEL.$;
  const newWaterLevel = std.min(waterLevel + value, MAX_WATER_LEVEL.$);
  std.atomicAdd(nextState.$[getIndex(x, y)], newWaterLevel - waterLevel);
});

const subtractFromCell = tgpu.fn([d.u32, d.u32, d.u32])((x, y, value) => {
  const cell = getCellNext(x, y);
  const waterLevel = cell & MAX_WATER_LEVEL.$;
  const newWaterLevel = std.max(waterLevel - std.min(value, waterLevel), 0);
  std.atomicSub(nextState.$[getIndex(x, y)], waterLevel - newWaterLevel);
});

const persistFlags = tgpu.fn([d.u32, d.u32])((x, y) => {
  const cell = getCell(x, y);
  const waterLevel = cell & MAX_WATER_LEVEL.$;
  const flags = cell >> 24;
  updateCell(x, y, (flags << 24) | waterLevel);
});

const getStableStateBelow = tgpu.fn([d.u32, d.u32], d.u32)((upper, lower) => {
  const totalMass = upper + lower;
  if (totalMass <= MAX_WATER_LEVEL_UNPRESSURIZED.$) {
    return totalMass;
  }
  if (totalMass >= MAX_WATER_LEVEL_UNPRESSURIZED.$ * 2 && upper > lower) {
    return d.u32(totalMass / 2) + MAX_PRESSURE.$;
  }
  return MAX_WATER_LEVEL_UNPRESSURIZED.$;
});

const isWall = tgpu.fn([d.u32, d.u32], d.bool)((x, y) =>
  getCell(x, y) >> 24 === 1
);

const isWaterSource = tgpu.fn([d.u32, d.u32], d.bool)((x, y) =>
  getCell(x, y) >> 24 === 2
);

const isWaterDrain = tgpu.fn([d.u32, d.u32], d.bool)((x, y) =>
  getCell(x, y) >> 24 === 3
);

const isClearCell = tgpu.fn([d.u32, d.u32], d.bool)((x, y) =>
  getCell(x, y) >> 24 === 4
);

const getWaterLevel = tgpu.fn([d.u32, d.u32], d.u32)((x, y) =>
  getCell(x, y) & MAX_WATER_LEVEL.$
);

const checkForFlagsAndBounds = tgpu.fn([d.u32, d.u32], d.bool)((x, y) => {
  if (isClearCell(x, y)) {
    updateCell(x, y, 0);
    return true;
  }

  if (isWall(x, y)) {
    persistFlags(x, y);
    return true;
  }

  if (isWaterSource(x, y)) {
    persistFlags(x, y);
    addToCell(x, y, 20);
    return false;
  }

  if (isWaterDrain(x, y)) {
    persistFlags(x, y);
    updateCell(x, y, 3 << 24);
    return true;
  }

  if (
    y === 0 ||
    y === size.$.y - 1 ||
    x === 0 ||
    x === size.$.x - 1
  ) {
    subtractFromCell(x, y, getWaterLevel(x, y));
    return true;
  }

  return false;
});

const decideWaterLevel = tgpu.fn([d.u32, d.u32])((x, y) => {
  if (checkForFlagsAndBounds(x, y)) {
    return;
  }

  let remainingWater = getWaterLevel(x, y);

  if (remainingWater === 0) {
    return;
  }

  if (!isWall(x, y - 1)) {
    const waterLevelBelow = getWaterLevel(x, y - 1);
    const stable = getStableStateBelow(
      remainingWater,
      waterLevelBelow,
    );
    if (waterLevelBelow < stable) {
      const change = stable - waterLevelBelow;
      const flow = std.min(change, viscosity.$);
      subtractFromCell(x, y, flow);
      addToCell(x, y - 1, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater === 0) {
    return;
  }

  const waterLevelBefore = remainingWater;
  if (!isWall(x - 1, y)) {
    const flowRaw = d.i32(waterLevelBefore) - d.i32(getWaterLevel(x - 1, y));
    if (flowRaw > 0) {
      const change = std.max(
        std.min(4, remainingWater),
        d.u32(flowRaw / 4),
      );
      const flow = std.min(change, viscosity.$);
      subtractFromCell(x, y, flow);
      addToCell(x - 1, y, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater === 0) {
    return;
  }

  if (!isWall(x + 1, y)) {
    const flowRaw = d.i32(waterLevelBefore) - d.i32(getWaterLevel(x + 1, y));
    if (flowRaw > 0) {
      const change = std.max(
        std.min(4, remainingWater),
        d.u32(flowRaw / 4),
      );
      const flow = std.min(change, viscosity.$);
      subtractFromCell(x, y, flow);
      addToCell(x + 1, y, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater === 0) {
    return;
  }

  if (!isWall(x, y + 1)) {
    const stable = getStableStateBelow(
      getWaterLevel(x, y + 1),
      remainingWater,
    );
    if (stable < remainingWater) {
      const flow = std.min(remainingWater - stable, viscosity.$);
      subtractFromCell(x, y, flow);
      addToCell(x, y + 1, flow);
      remainingWater -= flow;
    }
  }
});

const vertex = tgpu.vertexFn({
  in: {
    squareData: d.vec2f,
    currentStateData: d.u32,
    idx: d.builtin.instanceIndex,
  },
  out: { pos: d.builtin.position, cell: d.f32 },
})((input) => {
  const w = size.$.x;
  const h = size.$.y;
  const gridX = input.idx % w;
  const gridY = d.u32(input.idx / w);
  const maxDim = std.max(w, h);
  const x = (2 * (d.f32(gridX) + input.squareData.x) - d.f32(w)) / maxDim;
  const y = (2 * (d.f32(gridY) + input.squareData.y) - d.f32(h)) / maxDim;

  const cellFlags = input.currentStateData >> 24;
  let cell = d.f32(input.currentStateData & 0xffffff);
  if (cellFlags === 1) {
    cell = -1;
  }
  if (cellFlags === 2) {
    cell = -2;
  }
  if (cellFlags === 3) {
    cell = -3;
  }
  return { pos: d.vec4f(x, y, 0, 1), cell };
});

const fragment = tgpu.fragmentFn({
  in: { cell: d.f32 },
  out: d.vec4f,
})((input) => {
  if (input.cell === -1) {
    return d.vec4f(0.5, 0.5, 0.5, 1);
  }
  if (input.cell === -2) {
    return d.vec4f(0, 1, 0, 1);
  }
  if (input.cell === -3) {
    return d.vec4f(1, 0, 0, 1);
  }

  const normalized = std.min(input.cell / d.f32(0xff), 1);

  if (normalized === 0) {
    return d.vec4f();
  }

  const res = 1 / (1 + std.exp(-(normalized - 0.2) * 10));
  return d.vec4f(0, 0, res, res);
});

const vertexInstanceLayout = tgpu.vertexLayout(
  d.arrayOf(d.u32),
  'instance',
);
const vertexLayout = tgpu.vertexLayout(
  d.arrayOf(d.vec2f),
  'vertex',
);

let drawCanvasData: { idx: number; value: number }[] = [];

let msSinceLastTick = 0;
let render: () => void;
let applyDrawCanvas: () => void;
let renderChanges: () => void;

function resetGameData() {
  drawCanvasData = [];

  const compute = tgpu.computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [options.workgroupSize, options.workgroupSize],
  })((input) => {
    decideWaterLevel(input.gid.x, input.gid.y);
  });

  const computePipeline = root.createComputePipeline({
    compute,
  });

  const renderPipeline = root
    .createRenderPipeline({
      attribs: {
        squareData: vertexLayout.attrib,
        currentStateData: vertexInstanceLayout.attrib,
      },
      vertex,
      fragment,

      primitive: {
        topology: 'triangle-strip',
      },
    })
    .with(vertexLayout, squareBuffer)
    .with(vertexInstanceLayout, currentStateBuffer);

  currentStateBuffer.write(Array.from({ length: 1024 ** 2 }, () => 0));
  nextState.write(Array.from({ length: 1024 ** 2 }, () => 0));
  size.write(d.vec2u(options.size, options.size));

  render = () => {
    // compute
    computePipeline.dispatchWorkgroups(
      options.size / options.workgroupSize,
      options.size / options.workgroupSize,
    );

    // render
    renderPipeline
      .withColorAttachment({ view: context })
      .draw(4, options.size ** 2);

    currentStateBuffer.copyFrom(nextState.buffer);
  };

  applyDrawCanvas = () => {
    nextState.writePartial(drawCanvasData);

    drawCanvasData = [];
  };

  renderChanges = () => {
    renderPipeline
      .withColorAttachment({ view: context })
      .with(vertexLayout, squareBuffer)
      .with(vertexInstanceLayout, currentStateBuffer)
      .draw(4, options.size ** 2);
  };

  createSampleScene();
  applyDrawCanvas();
  render();
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
  renderChanges();
  if (longTouchTimeout) {
    clearTimeout(longTouchTimeout);
    longTouchTimeout = null;
  }
};

const handleDrawing = (x: number, y: number) => {
  const { brushSize, size, brushType } = options;
  const drawValue = isErasing ? 4 << 24 : encodeBrushType(brushType);

  const drawAtPoint = (px: number, py: number) => {
    for (let i = -brushSize; i <= brushSize; i++) {
      const cellX = px + i;
      if (cellX < 0 || cellX >= size) continue;
      const iSq = i * i;

      for (let j = -brushSize; j <= brushSize; j++) {
        const cellY = py + j;
        if (cellY < 0 || cellY >= size) continue;
        if (iSq + j * j > brushSize * brushSize) continue;

        const index = cellY * size + cellX;
        drawCanvasData.push({ idx: index, value: drawValue });
      }
    }
  };

  if (lastPoint) {
    const dx = x - lastPoint.x;
    const dy = y - lastPoint.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let step = 0; step <= steps; step++) {
      const interpX = Math.round(lastPoint.x + (dx * step) / steps);
      const interpY = Math.round(lastPoint.y + (dy * step) / steps);
      drawAtPoint(interpX, interpY);
    }
  } else {
    drawAtPoint(x, y);
  }

  lastPoint = { x, y };
  applyDrawCanvas();
  renderChanges();
};

canvas.onmousedown = (event) => {
  startDrawing(event.button === 2);
};

canvas.onmouseup = stopDrawing;

canvas.onmousemove = (event) => {
  if (!isDrawing) {
    return;
  }

  const cellSize = canvas.width / options.size;
  const x = Math.floor((event.offsetX * window.devicePixelRatio) / cellSize);
  const y = options.size -
    Math.floor((event.offsetY * window.devicePixelRatio) / cellSize) -
    1;

  handleDrawing(x, y);
};

canvas.ontouchstart = (event) => {
  event.preventDefault();
  touchMoved = false;
  longTouchTimeout = window.setTimeout(() => {
    if (!touchMoved) {
      startDrawing(true);
    }
  }, 500);
  startDrawing(false);
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
  const cellSize = canvas.width / options.size;
  const canvasPos = canvas.getBoundingClientRect();
  const x = Math.floor(
    ((touch.clientX - canvasPos.left) * window.devicePixelRatio) / cellSize,
  );
  const y = options.size -
    Math.floor(
      ((touch.clientY - canvasPos.top) * window.devicePixelRatio) / cellSize,
    ) -
    1;

  handleDrawing(x, y);
};

const createSampleScene = () => {
  const middlePoint = Math.floor(options.size / 2);
  const radius = Math.floor(options.size / 8);
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      if (i * i + j * j <= radius * radius) {
        drawCanvasData.push({
          idx: (middlePoint + j) * options.size + middlePoint + i,
          value: 1 << 24,
        });
      }
    }
  }

  const smallRadius = Math.min(Math.floor(radius / 8), 6);
  for (let i = -smallRadius; i <= smallRadius; i++) {
    for (let j = -smallRadius; j <= smallRadius; j++) {
      if (i * i + j * j <= smallRadius * smallRadius) {
        drawCanvasData.push({
          idx: (middlePoint + j + options.size / 4) * options.size +
            middlePoint +
            i,
          value: 2 << 24,
        });
      }
    }
  }

  for (let i = 0; i < options.size; i++) {
    drawCanvasData.push({ idx: i, value: 1 << 24 });
  }

  for (let i = 0; i < Math.floor(options.size / 8); i++) {
    drawCanvasData.push({ idx: i * options.size, value: 1 << 24 });
  }

  for (let i = 0; i < Math.floor(options.size / 8); i++) {
    drawCanvasData.push({
      idx: i * options.size + options.size - 1,
      value: 1 << 24,
    });
  }
};

resetGameData();
// #region UI

let paused = false;

let animationFrame: number;
let lastTime = performance.now();
function run(timestamp: number) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  msSinceLastTick += dt;

  if (msSinceLastTick >= options.timestep) {
    if (!paused) {
      for (let i = 0; i < options.stepsPerTimestep; i++) {
        render?.();
      }
    }
    msSinceLastTick -= options.timestep;
  }

  animationFrame = requestAnimationFrame(run);
}
animationFrame = requestAnimationFrame(run);

export const controls = defineControls({
  size: {
    initial: 32,
    options: [16, 32, 64, 128, 256, 512, 1024],
    onSelectChange: (value) => {
      options.size = value;
      resetGameData();
    },
  },

  'timestep (ms)': {
    initial: 25,
    min: 15,
    max: 100,
    step: 1,
    onSliderChange: (value) => {
      options.timestep = value;
    },
  },

  'steps per timestep': {
    initial: 1,
    min: 1,
    max: 50,
    step: 1,
    onSliderChange: (value) => {
      options.stepsPerTimestep = value;
    },
  },

  'workgroup size': {
    initial: 1,
    options: [1, 2, 4, 8, 16],
    onSelectChange: (value) => {
      options.workgroupSize = value;
      resetGameData();
    },
  },

  viscosity: {
    initial: 0,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      options.viscosity = 1000 - value * 990;
      viscosity.write(options.viscosity);
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
  root.destroy();
}

// #endregion
