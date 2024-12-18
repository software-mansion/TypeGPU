import * as d from 'typegpu/data';
import tgpu, { asUniform, asMutable, asReadonly } from 'typegpu/experimental';

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

const MAX_WATER_LEVEL_UNPRESSURIZED = '510u';
const MAX_WATER_LEVEL = '((1u << 24) - 1u)';
const MAX_PRESSURE = '12u';

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

const sizeBuffer = root.createBuffer(d.vec2u).$name('size').$usage('uniform');
const sizeUniform = asUniform(sizeBuffer);

const viscosityBuffer = root
  .createBuffer(d.u32)
  .$name('viscosity')
  .$usage('uniform');
const viscosityUniform = asUniform(viscosityBuffer);

const currentStateBuffer = root
  .createBuffer(d.arrayOf(d.u32, 1024 ** 2))
  .$name('current')
  .$usage('storage', 'vertex');
const currentStateStorage = asReadonly(currentStateBuffer);

const nextStateBuffer = root
  .createBuffer(d.arrayOf(d.atomic(d.u32), 1024 ** 2))
  .$name('next')
  .$usage('storage');
const nextStateStorage = asMutable(nextStateBuffer);

const squareBuffer = root
  .createBuffer(d.arrayOf(d.vec2f, 4), [
    d.vec2f(0, 0),
    d.vec2f(0, 1),
    d.vec2f(1, 0),
    d.vec2f(1, 1),
  ])
  .$usage('vertex')
  .$name('square');

const getIndex = tgpu
  .fn([d.u32, d.u32], d.u32)
  .does(/* wgsl */ `(x: u32, y: u32) -> u32 {
  let h = sizeData.y;
  let w = sizeData.x;
  return (y % h) * w + (x % w);
}`)
  .$uses({ sizeData: sizeUniform });

const getCell = tgpu
  .fn([d.u32, d.u32], d.u32)
  .does(/* wgsl */ `(x: u32, y: u32) -> u32 {
  return currentStateData[getIndex(x, y)];
}`)
  .$uses({ currentStateData: currentStateStorage, getIndex });

const getCellNext = tgpu
  .fn([d.u32, d.u32], d.u32)
  .does(/* wgsl */ `(x: u32, y: u32) -> u32 {
  return atomicLoad(&nextStateData[getIndex(x, y)]);
}`)
  .$uses({ nextStateData: nextStateStorage, getIndex });

const updateCell = tgpu
  .fn([d.u32, d.u32, d.u32])
  .does(/* wgsl */ `(x: u32, y: u32, value: u32) {
  atomicStore(&nextStateData[getIndex(x, y)], value);
}`)
  .$uses({ nextStateData: nextStateStorage, getIndex });

const addToCell = tgpu
  .fn([d.u32, d.u32, d.u32])
  .does(/* wgsl */ `(x: u32, y: u32, value: u32) {
  let cell = getCellNext(x, y);
  let waterLevel = cell & ${MAX_WATER_LEVEL};
  let newWaterLevel = min(waterLevel + value, ${MAX_WATER_LEVEL});
  atomicAdd(&nextStateData[getIndex(x, y)], newWaterLevel - waterLevel);
}`)
  .$uses({ getCellNext, nextStateData: nextStateStorage, getIndex });

const subtractFromCell = tgpu
  .fn([d.u32, d.u32, d.u32])
  .does(/* wgsl */ `(x: u32, y: u32, value: u32) {
  let cell = getCellNext(x, y);
  let waterLevel = cell & ${MAX_WATER_LEVEL};
  let newWaterLevel = max(waterLevel - min(value, waterLevel), 0u);
  atomicSub(&nextStateData[getIndex(x, y)], waterLevel - newWaterLevel);
}`)
  .$uses({ getCellNext, nextStateData: nextStateStorage, getIndex });

const persistFlags = tgpu
  .fn([d.u32, d.u32])
  .does(/* wgsl */ `(x: u32, y: u32) {
  let cell = getCell(x, y);
  let waterLevel = cell & ${MAX_WATER_LEVEL};
  let flags = cell >> 24;
  updateCell(x, y, (flags << 24) | waterLevel);
}`)
  .$uses({ getCell, updateCell });

const getStableStateBelow = tgpu.fn([d.u32, d.u32], d.u32).does(/* wgsl */ `(upper: u32, lower: u32) -> u32 {
  let totalMass = upper + lower;
  if (totalMass <= ${MAX_WATER_LEVEL_UNPRESSURIZED}) {
    return totalMass;
  } else if (totalMass >= ${MAX_WATER_LEVEL_UNPRESSURIZED}*2 && upper > lower) {
    return totalMass/2 + ${MAX_PRESSURE};
  }
  return ${MAX_WATER_LEVEL_UNPRESSURIZED};
}`);

const isWall = tgpu
  .fn([d.u32, d.u32], d.bool)
  .does(/* wgsl */ `(x: u32, y: u32) -> bool {
  return (getCell(x, y) >> 24) == 1u;
}`)
  .$uses({ getCell });

const isWaterSource = tgpu
  .fn([d.u32, d.u32], d.bool)
  .does(/* wgsl */ `(x: u32, y: u32) -> bool {
  return (getCell(x, y) >> 24) == 2u;
}`)
  .$uses({ getCell });

const isWaterDrain = tgpu
  .fn([d.u32, d.u32], d.bool)
  .does(/* wgsl */ `(x: u32, y: u32) -> bool {
  return (getCell(x, y) >> 24) == 3u;
}`)
  .$uses({ getCell });

const isClearCell = tgpu
  .fn([d.u32, d.u32], d.bool)
  .does(/* wgsl */ `(x: u32, y: u32) -> bool {
  return (getCell(x, y) >> 24) == 4u;
}`)
  .$uses({ getCell });

const getWaterLevel = tgpu
  .fn([d.u32, d.u32], d.u32)
  .does(/* wgsl */ `(x: u32, y: u32) -> u32 {
  return getCell(x, y) & ${MAX_WATER_LEVEL};
}`)
  .$uses({ getCell });

const checkForFlagsAndBounds = tgpu
  .fn([d.u32, d.u32], d.bool)
  .does(/* wgsl */ `(x: u32, y: u32) -> bool {
  if (isClearCell(x, y)) {
    updateCell(x, y, 0u);
    return true;
  }

  if (isWall(x, y)) {
    persistFlags(x, y);
    return true;
  }

  if (isWaterSource(x, y)) {
    persistFlags(x, y);
    addToCell(x, y, 10u);
    return false;
  }

  if (isWaterDrain(x, y)) {
    persistFlags(x, y);
    updateCell(x, y, 3u << 24);
    return true;
  }

  if (y == 0 || y == sizeData.y - 1u || x == 0 || x == sizeData.x - 1u) {
    subtractFromCell(x, y, getWaterLevel(x, y));
    return true;
  }

  return false;
}`)
  .$uses({
    isClearCell,
    updateCell,
    persistFlags,
    addToCell,
    subtractFromCell,
    isWall,
    isWaterSource,
    isWaterDrain,
    getWaterLevel,
    sizeData: sizeUniform,
  });

const decideWaterLevel = tgpu
  .fn([d.u32, d.u32])
  .does(/* wgsl */ `(x: u32, y: u32) {
  if (checkForFlagsAndBounds(x, y)) {
    return;
  }

  var remainingWater: u32 = getWaterLevel(x, y);

  if (remainingWater == 0u) {
    return;
  }

  if (!isWall(x, y - 1u)) {
    let waterLevelBelow = getWaterLevel(x, y - 1u);
    let stable = getStableStateBelow(remainingWater, waterLevelBelow);
    if (waterLevelBelow < stable) {
      let change = stable - waterLevelBelow;
      let flow = min(change, viscosityData);
      subtractFromCell(x, y, flow);
      addToCell(x, y - 1u, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater == 0u) {
    return;
  }

  let waterLevelBefore = remainingWater;
  if (!isWall(x - 1u, y)) {
    let flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel(x - 1u, y)));
    if (flowRaw > 0) {
      let change = max(min(4u, remainingWater), u32(flowRaw)/4);
      let flow = min(change, viscosityData);
      subtractFromCell(x, y, flow);
      addToCell(x - 1u, y, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater == 0u) {
    return;
  }

  if (!isWall(x + 1u, y)) {
    let flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel(x + 1, y)));
    if (flowRaw > 0) {
      let change = max(min(4u, remainingWater), u32(flowRaw)/4);
      let flow = min(change, viscosityData);
      subtractFromCell(x, y, flow);
      addToCell(x + 1u, y, flow);
      remainingWater -= flow;
    }
  }

  if (remainingWater == 0u) {
    return;
  }

  if (!isWall(x, y + 1u)) {
    let stable = getStableStateBelow(getWaterLevel(x, y + 1u), remainingWater);
    if (stable < remainingWater) {
      let flow = min(remainingWater - stable, viscosityData);
      subtractFromCell(x, y, flow);
      addToCell(x, y + 1u, flow);
      remainingWater -= flow;
    }
  }
}`)
  .$uses({
    checkForFlagsAndBounds,
    getWaterLevel,
    isWall,
    getStableStateBelow,
    subtractFromCell,
    addToCell,
    viscosityData: viscosityUniform,
  });

const compute = tgpu
  .computeFn([d.builtin.globalInvocationId], {
    workgroupSize: [options.workgroupSize, options.workgroupSize],
  })
  .does(/* wgsl */ `(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x;
  let y = gid.y;
  decideWaterLevel(x, y);
}`)
  .$uses({ decideWaterLevel });

console.log(
  tgpu.resolve({
    input: [compute],
  }),
);

const vertex = tgpu
  .vertexFn(
    {
      squareData: d.vec2f,
      currentStateData: d.u32,
      idx: d.builtin.instanceIndex,
    },
    { pos: d.builtin.position, cell: d.f32 },
  )
  .does(/* wgsl */ `(@builtin(instance_index) idx: u32, @location(0) squareData: vec2f, @location(1) currentStateData: u32) -> VertexOut {
  let w = sizeData.x;
  let h = sizeData.y;
  let x = ((f32(idx % w) + squareData.x) / f32(w) - 0.5) * 2. * f32(w) / f32(max(w, h));
  let y = (f32((idx - (idx % w)) / w + u32(squareData.y)) / f32(h) - 0.5) * 2. * f32(h) / f32(max(w, h));
  let cellFlags = currentStateData >> 24;
  let cellVal = f32(currentStateData & 0xFFFFFF);
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
  return VertexOut(vec4<f32>(x, y, 0., 1.), cell);
}`)
  .$uses({
    sizeData: sizeUniform,
  });

const fragment = tgpu.fragmentFn({ cell: d.f32 }, d.vec4f).does(/* wgsl */ `(@location(0) cell: f32) -> @location(0) vec4f {
  if (cell == -1.) {
    return vec4<f32>(0.5, 0.5, 0.5, 1.);
  }
  if (cell == -2.) {
    return vec4<f32>(0., 1., 0., 1.);
  }
  if (cell == -3.) {
    return vec4<f32>(1., 0., 0., 1.);
  }

  var r = f32((u32(cell) >> 16) & 0xFF)/255.;
  var g = f32((u32(cell) >> 8) & 0xFF)/255.;
  var b = f32(u32(cell) & 0xFF)/255.;
  if (r > 0.) { g = 1.;}
  if (g > 0.) { b = 1.;}
  if (b > 0. && b < 0.5) { b = 0.5;}

  if (r == 0. && g == 0. && b == 0.) {
    return vec4<f32>(0.937, 0.937, 0.976, 1.);
  }

  return vec4f(r, g, b, 1.);
}`);

const vertexInstanceLayout = tgpu.vertexLayout(
  (n: number) => d.arrayOf(d.u32, n),
  'instance',
);
const vertexLayout = tgpu.vertexLayout(
  (n: number) => d.arrayOf(d.vec2f, n),
  'vertex',
);

let drawCanvasData = new Uint32Array(options.size * options.size);

let msSinceLastTick = 0;
let render: () => void;
let applyDrawCanvas: () => void;
let renderChanges: () => void;

function resetGameData() {
  drawCanvasData = new Uint32Array(options.size * options.size);

  const cpp = root.withCompute(compute).createPipeline();
  const vp = root
    .withVertex(vertex, {
      squareData: vertexLayout.attrib,
      currentStateData: vertexInstanceLayout.attrib,
    })
    .withFragment(fragment, {
      format: presentationFormat,
    })
    .withPrimitive({
      topology: 'triangle-strip',
    })
    .createPipeline();

  currentStateBuffer.write(Array.from({ length: 1024 ** 2 }, () => 0));
  nextStateBuffer.write(Array.from({ length: 1024 ** 2 }, () => 0));
  sizeBuffer.write(d.vec2u(options.size, options.size));

  render = () => {
    // compute
    cpp.dispatchWorkgroups(
      options.size / options.workgroupSize,
      options.size / options.workgroupSize,
    );

    // render
    vp.withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    })
      .with(vertexLayout, squareBuffer)
      .with(vertexInstanceLayout, currentStateBuffer)
      .draw(4, options.size ** 2);

    root.flush();

    nextStateBuffer.copyFrom(currentStateBuffer);
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
    vp.withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    })
      .with(vertexLayout, squareBuffer)
      .with(vertexInstanceLayout, currentStateBuffer)
      .draw(4, options.size ** 2);
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
