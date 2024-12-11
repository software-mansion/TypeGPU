// @ts-nocheck
// TODO: Reenable type checking when new pipelines are implemented.

import {
  type TgpuArray,
  type U32,
  arrayOf,
  atomic,
  f32,
  u32,
  vec2u,
} from 'typegpu/data';
import tgpu, {
  asMutable,
  asReadonly,
  asUniform,
  asVertex,
  builtin,
  wgsl,
  type TgpuBuffer,
} from 'typegpu/experimental';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});
canvas.addEventListener('contextmenu', (event) => {
  if (event.target === canvas) {
    event.preventDefault();
  }
});

const options = {
  size: 64,
  timestep: 25,
  stepsPerTimestep: 1,
  workgroupSize: 16,
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

const sizeBuffer = root.createBuffer(vec2u).$name('size').$usage('uniform');
const viscosityBuffer = root
  .createBuffer(u32)
  .$name('viscosity')
  .$usage('uniform');

const currentStateBuffer = root
  .createBuffer(arrayOf(u32, 1024 ** 2))
  .$name('current')
  .$usage('storage', 'vertex');

const nextStateBuffer = root
  .createBuffer(arrayOf(atomic(u32), 1024 ** 2))
  .$name('next')
  .$usage('storage');

const viscosityData = asUniform(viscosityBuffer);
const currentStateData = asReadonly(currentStateBuffer);
const currentStateVertex = asVertex(currentStateBuffer, 'instance');
const sizeData = asUniform(sizeBuffer);
const nextStateData = asMutable(nextStateBuffer);

const maxWaterLevelUnpressurized = wgsl.constant(wgsl`510u`);
const maxWaterLevel = wgsl.constant(wgsl`(1u << 24) - 1u`);
const maxCompress = wgsl.constant(wgsl`12u`);

const squareBuffer = root
  .createBuffer(arrayOf(vec2u, 4), [
    vec2u(0, 0),
    vec2u(0, 1),
    vec2u(1, 0),
    vec2u(1, 1),
  ])
  .$usage('uniform', 'vertex')
  .$name('square');

const squareBufferData = asVertex(squareBuffer, 'vertex');

const getIndex = wgsl.fn`(x: u32, y: u32) -> u32 {
  let h = ${sizeData}.y;
  let w = ${sizeData}.x;
  return (y % h) * w + (x % w);
}`;

const getCell = wgsl.fn`(x: u32, y: u32) -> u32 {
  return ${currentStateData}[${getIndex}(x, y)];
}`;

const getCellNext = wgsl.fn`(x: u32, y: u32) -> u32 {
  return atomicLoad(&${nextStateData}[${getIndex}(x, y)]);
}`;

const updateCell = wgsl.fn`(x: u32, y: u32, value: u32) {
  atomicStore(&${nextStateData}[${getIndex}(x, y)], value);
}`;

const addToCell = wgsl.fn`(x: u32, y: u32, value: u32) {
  let cell = ${getCellNext}(x, y);
  let waterLevel = cell & ${maxWaterLevel};
  let newWaterLevel = min(waterLevel + value, ${maxWaterLevel});
  atomicAdd(&${nextStateData}[${getIndex}(x, y)], newWaterLevel - waterLevel);
}`;

const subtractFromCell = wgsl.fn`(x: u32, y: u32, value: u32) {
  let cell = ${getCellNext}(x, y);
  let waterLevel = cell & ${maxWaterLevel};
  let newWaterLevel = max(waterLevel - min(value, waterLevel), 0u);
  atomicSub(&${nextStateData}[${getIndex}(x, y)], waterLevel - newWaterLevel);
}`;

const persistFlags = wgsl.fn`(x: u32, y: u32) {
  let cell = ${getCell}(x, y);
  let waterLevel = cell & ${maxWaterLevel};
  let flags = cell >> 24;
  ${updateCell}(x, y, (flags << 24) | waterLevel);
}`;

const getStableStateBelow = wgsl.fn`(upper: u32, lower: u32) -> u32 {
  let totalMass = upper + lower;
  if (totalMass <= ${maxWaterLevelUnpressurized}) {
    return totalMass;
  } else if (totalMass >= ${maxWaterLevelUnpressurized}*2 && upper > lower) {
    return totalMass/2 + ${maxCompress};
  }
  return ${maxWaterLevelUnpressurized};
}`;

const isWall = wgsl.fn`(x: u32, y: u32) -> bool {
  return (${getCell}(x, y) >> 24) == 1u;
}`;

const isWaterSource = wgsl.fn`(x: u32, y: u32) -> bool {
  return (${getCell}(x, y) >> 24) == 2u;
}`;

const isWaterDrain = wgsl.fn`(x: u32, y: u32) -> bool {
  return (${getCell}(x, y) >> 24) == 3u;
}`;

const isClearCell = wgsl.fn`(x: u32, y: u32) -> bool {
  return (${getCell}(x, y) >> 24) == 4u;
}`;

const getWaterLevel = wgsl.fn`(x: u32, y: u32) -> u32 {
  return ${getCell}(x, y) & ${maxWaterLevel};
}`;

const checkForFlagsAndBounds = wgsl.fn`(x: u32, y: u32) -> bool {
  if (${isClearCell}(x, y)) {
    ${updateCell}(x, y, 0u);
    return true;
  }
  if (${isWall}(x, y)) {
    ${persistFlags}(x, y);
    return true;
  }
  if (${isWaterSource}(x, y)) {
    ${persistFlags}(x, y);
    ${addToCell}(x, y, 10u);
    return false;
  }
  if (${isWaterDrain}(x, y)) {
    ${persistFlags}(x, y);
    ${updateCell}(x, y, 3u << 24);
    return true;
  }
  if (y == 0 || y == ${sizeData}.y - 1u || x == 0 || x == ${sizeData}.x - 1u) {
    ${subtractFromCell}(x, y, ${getWaterLevel}(x, y));
    return true;
  }
  return false;
}`;

const decideWaterLevel = wgsl.fn`(x: u32, y: u32) {
  if (${checkForFlagsAndBounds}(x, y)) {
    return;
  }

  var remainingWater: u32 = ${getWaterLevel}(x, y);

  if (remainingWater == 0u) {
    return;
  }

  if (!${isWall}(x, y - 1u)) {
    let waterLevelBelow = ${getWaterLevel}(x, y - 1u);
    let stable = ${getStableStateBelow}(remainingWater, waterLevelBelow);
    if (waterLevelBelow < stable) {
      let change = stable - waterLevelBelow;
      let flow = min(change, ${viscosityData});
      ${subtractFromCell}(x, y, flow);
      ${addToCell}(x, y - 1u, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater == 0u) {
    return;
  }

  let waterLevelBefore = remainingWater;
  if (!${isWall}(x - 1u, y)) {
    let flowRaw = (i32(waterLevelBefore) - i32(${getWaterLevel}(x - 1u, y)));
    if (flowRaw > 0) {
      let change = max(min(4u, remainingWater), u32(flowRaw)/4);
      let flow = min(change, ${viscosityData});
      ${subtractFromCell}(x, y, flow);
      ${addToCell}(x - 1u, y, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater == 0u) {
    return;
  }

  if (!${isWall}(x + 1u, y)) {
    let flowRaw = (i32(waterLevelBefore) - i32(${getWaterLevel}(x + 1, y)));
    if (flowRaw > 0) {
      let change = max(min(4u, remainingWater), u32(flowRaw)/4);
      let flow = min(change, ${viscosityData});
      ${subtractFromCell}(x, y, flow);
      ${addToCell}(x + 1u, y, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater == 0u) {
    return;
  }

  if (!${isWall}(x, y + 1u)) {
    let stable = ${getStableStateBelow}(${getWaterLevel}(x, y + 1u), remainingWater);
    if (stable < remainingWater) {
      let flow = min(remainingWater - stable, ${viscosityData});
      ${subtractFromCell}(x, y, flow);
      ${addToCell}(x, y + 1u, flow);
      remainingWater -= flow;
    }
  }
}`;

const computeWGSL = wgsl`
  let x = ${builtin.globalInvocationId}.x;
  let y = ${builtin.globalInvocationId}.y;
  ${decideWaterLevel}(x, y);
`;

const vertWGSL = wgsl`
  let w = ${sizeData}.x;
  let h = ${sizeData}.y;
  let x = (f32(${builtin.instanceIndex} % w + ${squareBufferData}.x) / f32(w) - 0.5) * 2. * f32(w) / f32(max(w, h));
  let y = (f32((${builtin.instanceIndex} - (${builtin.instanceIndex} % w)) / w + ${squareBufferData}.y) / f32(h) - 0.5) * 2. * f32(h) / f32(max(w, h));
  let cellFlags = ${currentStateVertex} >> 24;
  let cellVal = f32(${currentStateVertex} & 0xFFFFFF);
  let pos = vec4<f32>(x, y, 0., 1.);
  var cell: f32;
  cell = cellVal;
  if (cellFlags == 1u) {
    cell = -1.;
  }
  if (cellFlags == 2u) {
    cell = -2.;
  }
  if (cellFlags == 3u) {
    cell = -3.;
  }
`;

const fragWGSL = wgsl`
  if (cell == -1.) {
    return vec4f(0.5, 0.5, 0.5, 1.);
  }
  if (cell == -2.) {
    return vec4f(0., 1., 0., 1.);
  }
  if (cell == -3.) {
    return vec4f(1., 0., 0., 1.);
  }

  var r = f32((u32(cell) >> 16) & 0xFF)/255.;
  var g = f32((u32(cell) >> 8) & 0xFF)/255.;
  var b = f32(u32(cell) & 0xFF)/255.;
  if (r > 0.) { g = 1.;}
  if (g > 0.) { b = 1.;}
  if (b > 0. && b < 0.5) { b = 0.5;}

  return vec4f(r, g, b, 1.);
`;

let drawCanvasData = new Uint32Array(options.size * options.size);

let msSinceLastTick = 0;
let render: () => void;
let applyDrawCanvas: () => void;
let renderChanges: () => void;

function resetGameData() {
  drawCanvasData = new Uint32Array(options.size * options.size);

  const computePipeline = root.makeComputePipeline({
    workgroupSize: [options.workgroupSize, options.workgroupSize],
    code: computeWGSL,
  });

  const renderPipeline = root.makeRenderPipeline({
    vertex: {
      code: vertWGSL,
      output: {
        [builtin.position.s]: 'pos',
        cell: f32,
      },
    },
    fragment: {
      code: fragWGSL,
      target: [{ format: presentationFormat }],
    },
    primitive: { topology: 'triangle-strip' },
  });

  currentStateBuffer.write(Array.from({ length: 1024 ** 2 }, () => 0));
  nextStateBuffer.write(Array.from({ length: 1024 ** 2 }, () => 0));
  sizeBuffer.write(vec2u(options.size, options.size));

  render = () => {
    const view = context.getCurrentTexture().createView();

    // compute
    computePipeline.execute({
      workgroups: [
        options.size / options.workgroupSize,
        options.size / options.workgroupSize,
      ],
    });

    // render
    renderPipeline.execute({
      colorAttachments: [
        {
          view,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      vertexCount: 4,
      instanceCount: options.size ** 2,
    });

    root.flush();

    currentStateBuffer.write(
      // The atomic<> prevents this from being a 1-to-1 match.
      nextStateBuffer as unknown as TgpuBuffer<TgpuArray<U32>>,
    );
  };

  applyDrawCanvas = () => {
    const commandEncoder = root.device.createCommandEncoder();

    for (let i = 0; i < options.size; i++) {
      for (let j = 0; j < options.size; j++) {
        if (drawCanvasData[j * options.size + i] === 0) {
          continue;
        }

        const index = j * options.size + i;
        root.device.queue.writeBuffer(
          currentStateBuffer.buffer,
          index * Uint32Array.BYTES_PER_ELEMENT,
          drawCanvasData,
          index,
          1,
        );
      }
    }

    root.device.queue.submit([commandEncoder.finish()]);
    drawCanvasData.fill(0);
  };

  renderChanges = () => {
    const view = context.getCurrentTexture().createView();
    renderPipeline.execute({
      colorAttachments: [
        {
          view,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      vertexCount: 4,
      instanceCount: options.size ** 2,
    });
    root.flush();
  };

  createSampleScene();
  applyDrawCanvas();
  render();
}

let isDrawing = false;
let isErasing = false;

canvas.onmousedown = (event) => {
  isDrawing = true;
  isErasing = event.button === 2;
};

canvas.onmouseup = () => {
  isDrawing = false;
  renderChanges();
};

canvas.onmousemove = (event) => {
  if (!isDrawing) {
    return;
  }

  const cellSize = canvas.width / options.size;
  const x = Math.floor((event.offsetX * window.devicePixelRatio) / cellSize);
  const y =
    options.size -
    Math.floor((event.offsetY * window.devicePixelRatio) / cellSize) -
    1;
  const allAffectedCells = [];
  for (let i = -options.brushSize; i <= options.brushSize; i++) {
    for (let j = -options.brushSize; j <= options.brushSize; j++) {
      if (
        i * i + j * j <= options.brushSize * options.brushSize &&
        x + i >= 0 &&
        x + i < options.size &&
        y + j >= 0 &&
        y + j < options.size
      ) {
        allAffectedCells.push({ x: x + i, y: y + j });
      }
    }
  }

  if (isErasing) {
    for (const cell of allAffectedCells) {
      drawCanvasData[cell.y * options.size + cell.x] = 4 << 24;
    }
  } else {
    for (const cell of allAffectedCells) {
      drawCanvasData[cell.y * options.size + cell.x] = encodeBrushType(
        options.brushType,
      );
    }
  }

  applyDrawCanvas();
  renderChanges();
};

const createSampleScene = () => {
  const middlePoint = Math.floor(options.size / 2);
  const radius = Math.floor(options.size / 8);
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      if (i * i + j * j <= radius * radius) {
        drawCanvasData[(middlePoint + j) * options.size + middlePoint + i] =
          1 << 24;
      }
    }
  }

  const smallRadius = Math.min(Math.floor(radius / 8), 6);
  for (let i = -smallRadius; i <= smallRadius; i++) {
    for (let j = -smallRadius; j <= smallRadius; j++) {
      if (i * i + j * j <= smallRadius * smallRadius) {
        drawCanvasData[
          (middlePoint + j + options.size / 4) * options.size + middlePoint + i
        ] = 2 << 24;
      }
    }
  }

  for (let i = 0; i < options.size; i++) {
    drawCanvasData[i] = 1 << 24;
  }

  for (let i = 0; i < Math.floor(options.size / 8); i++) {
    drawCanvasData[i * options.size] = 1 << 24;
  }
};

// #region UI

let paused = false;
let disposed = false;

const onFrame = (loop: (deltaTime: number) => unknown) => {
  let lastTime = Date.now();
  const runner = () => {
    if (disposed) {
      return;
    }
    const now = Date.now();
    const dt = now - lastTime;
    lastTime = now;
    loop(dt);
    requestAnimationFrame(runner);
  };
  requestAnimationFrame(runner);
};

onFrame((deltaTime: number) => {
  msSinceLastTick += deltaTime;

  if (msSinceLastTick >= options.timestep) {
    if (!paused) {
      for (let i = 0; i < options.stepsPerTimestep; i++) {
        render();
      }
    }
    msSinceLastTick -= options.timestep;
  }
});

export const controls = {
  size: {
    initial: '64',
    options: [16, 32, 64, 128, 256, 512, 1024].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      options.size = Number.parseInt(value);
      resetGameData();
    },
  },

  'timestep (ms)': {
    initial: 15,
    min: 15,
    max: 100,
    step: 1,
    onSliderChange: (value: number) => {
      options.timestep = value;
    },
  },

  'steps per timestep': {
    initial: 10,
    min: 1,
    max: 50,
    step: 1,
    onSliderChange: (value: number) => {
      options.stepsPerTimestep = value;
    },
  },

  'workgroup size': {
    initial: '16',
    options: [1, 2, 4, 8, 16].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      options.workgroupSize = Number.parseInt(value);
      resetGameData();
    },
  },

  viscosity: {
    initial: 1000,
    min: 10,
    max: 1000,
    step: 1,
    onSliderChange: (value: number) => {
      options.viscosity = value;
      viscosityBuffer.write(value);
    },
  },

  'brush size': {
    initial: 0,
    min: 0,
    max: 10,
    step: 1,
    onSliderChange: (value: number) => {
      options.brushSize = value;
    },
  },

  'brush type': {
    initial: 'water',
    options: BrushTypes,
    onSelectChange: (value: string) => {
      options.brushType = value;
    },
  },

  pause: {
    initial: false,
    onToggleChange: (value: boolean) => {
      paused = value;
    },
  },
};

export function onCleanup() {
  disposed = true;
  root.destroy();
}

// #endregion
