/*
{
  "title": "Fluid Simulation",
  "category": "simulation"
}
*/
/* global GPUShaderStage, GPUBufferUsage, GPUMapMode */

import { addElement, addParameter, onFrame } from '@wigsill/example-toolkit';
import {
  ProgramBuilder,
  arrayOf,
  atomic,
  createRuntime,
  u32,
  vec2u,
  wgsl,
} from 'wigsill';

const runtime = await createRuntime();
const device = runtime.device;

const canvas = await addElement('canvas', { width: 500, height: 500 });

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
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

const sizeBuffer = wgsl.buffer(vec2u).$name('size').$allowUniform();

const viscosityBuffer = wgsl.buffer(u32).$name('viscosity').$allowUniform();

const debugInfoBuffer = wgsl
  .buffer(atomic(u32))
  .$name('debug')
  .$allowMutableStorage();

const currentStateBuffer = wgsl
  .buffer(arrayOf(u32, 1024 ** 2))
  .$name('current')
  .$addFlags(GPUBufferUsage.VERTEX)
  .$allowReadonlyStorage();

const nextStateBuffer = wgsl
  .buffer(arrayOf(atomic(u32), 1024 ** 2))
  .$name('next')
  .$allowMutableStorage();

const viscosityData = viscosityBuffer.asUniform();
const currentStateData = currentStateBuffer.asReadonlyStorage();
const sizeData = sizeBuffer.asUniform();
const nextStateData = nextStateBuffer.asStorage();
const debugInfoData = debugInfoBuffer.asStorage();

const maxWaterLevelUnpressurized = wgsl.constant(wgsl`510u`);
const maxWaterLevel = wgsl.constant(wgsl`(1u << 24) - 1u`);
const maxCompress = wgsl.constant(wgsl`12u`);

const getIndex = wgsl.fn()`(x: u32, y: u32) -> u32 {
  let h = ${sizeData}.y;
  let w = ${sizeData}.x;
  return (y % h) * w + (x % w);
}`;

const getCell = wgsl.fn()`(x: u32, y: u32) -> u32 {
  return ${currentStateData}[${getIndex}(x, y)];
}`;

const getCellNext = wgsl.fn()`(x: u32, y: u32) -> u32 {
  return atomicLoad(&${nextStateData}[${getIndex}(x, y)]);
}`;

const updateCell = wgsl.fn()`(x: u32, y: u32, value: u32) {
  atomicStore(&${nextStateData}[${getIndex}(x, y)], value);
}`;

const addToCell = wgsl.fn()`(x: u32, y: u32, value: u32) {
  let cell = ${getCellNext}(x, y);
  let waterLevel = cell & ${maxWaterLevel};
  let newWaterLevel = min(waterLevel + value, ${maxWaterLevel});
  atomicAdd(&${nextStateData}[${getIndex}(x, y)], newWaterLevel - waterLevel);
}`;

const subtractFromCell = wgsl.fn()`(x: u32, y: u32, value: u32) {
  let cell = ${getCellNext}(x, y);
  let waterLevel = cell & ${maxWaterLevel};
  let newWaterLevel = max(waterLevel - min(value, waterLevel), 0u);
  atomicSub(&${nextStateData}[${getIndex}(x, y)], waterLevel - newWaterLevel);
}`;

const persistFlags = wgsl.fn()`(x: u32, y: u32) {
  let cell = ${getCell}(x, y);
  let waterLevel = cell & ${maxWaterLevel};
  let flags = cell >> 24;
  ${updateCell}(x, y, (flags << 24) | waterLevel);
}`;

const getStableStateBelow = wgsl.fn()`(upper: u32, lower: u32) -> u32 {
  let totalMass = upper + lower;
  if (totalMass <= ${maxWaterLevelUnpressurized}) {
    return totalMass;
  } else if (totalMass >= ${maxWaterLevelUnpressurized}*2 && upper > lower) {
    return totalMass/2 + ${maxCompress};
  }
  return ${maxWaterLevelUnpressurized};
}`;

const isWall = wgsl.fn()`(x: u32, y: u32) -> bool {
  return (${getCell}(x, y) >> 24) == 1u;
}`;

const isWaterSource = wgsl.fn()`(x: u32, y: u32) -> bool {
  return (${getCell}(x, y) >> 24) == 2u;
}`;

const isWaterDrain = wgsl.fn()`(x: u32, y: u32) -> bool {
  return (${getCell}(x, y) >> 24) == 3u;
}`;

const isClearCell = wgsl.fn()`(x: u32, y: u32) -> bool {
  return (${getCell}(x, y) >> 24) == 4u;
}`;

const getWaterLevel = wgsl.fn()`(x: u32, y: u32) -> u32 {
  return ${getCell}(x, y) & ${maxWaterLevel};
}`;

const checkForFlagsAndBounds = wgsl.fn()`(x: u32, y: u32) -> bool {
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

const decideWaterLevel = wgsl.fn()`(x: u32, y: u32) {
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
override blockSize = 8;

@compute @workgroup_size(blockSize, blockSize)
fn main(@builtin(global_invocation_id) grid: vec3u) {
  let x = grid.x;
  let y = grid.y;
  atomicAdd(&${debugInfoData}, ${getWaterLevel}(x, y));
  ${decideWaterLevel}(x, y);
}
`;

const vertWGSL = wgsl`
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) cell: f32,
}

@vertex
fn main(@builtin(instance_index) i: u32, @location(0) cell: u32, @location(1) pos: vec2u) -> Out {
  let w = ${sizeData}.x;
  let h = ${sizeData}.y;
  let x = (f32(i % w + pos.x) / f32(w) - 0.5) * 2. * f32(w) / f32(max(w, h));
  let y = (f32((i - (i % w)) / w + pos.y) / f32(h) - 0.5) * 2. * f32(h) / f32(max(w, h));
  let cellFlags = cell >> 24;
  let cellVal = f32(cell & 0xFFFFFF);
  if (cellFlags == 1u) {
    return Out(vec4f(x, y, 0., 1.), -1.);
  }
  if (cellFlags == 2u) {
    return Out(vec4f(x, y, 0., 1.), -2.);
  }
  if (cellFlags == 3u) {
    return Out(vec4f(x, y, 0., 1.), -3.);
  }

  return Out(vec4f(x, y, 0., 1.), cellVal);
}
`;

const fragWGSL = `
@fragment
fn main(@location(0) cell: f32) -> @location(0) vec4f {
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
}
`;

let drawCanvasData = new Uint32Array(options.size * options.size);

const computeProgram = new ProgramBuilder(runtime, computeWGSL).build({
  bindingGroup: 0,
  shaderStage: GPUShaderStage.COMPUTE,
});

const vertexProgram = new ProgramBuilder(runtime, vertWGSL).build({
  bindingGroup: 0,
  shaderStage: GPUShaderStage.VERTEX,
});

const computeShader = device.createShaderModule({ code: computeProgram.code });

const squareVertices = new Uint32Array([0, 0, 0, 1, 1, 0, 1, 1]);
const squareBuffer = device.createBuffer({
  size: squareVertices.byteLength,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
new Uint32Array(squareBuffer.getMappedRange()).set(squareVertices);
squareBuffer.unmap();

const squareStride = {
  arrayStride: 2 * squareVertices.BYTES_PER_ELEMENT,
  stepMode: 'vertex' as const,
  attributes: [
    {
      shaderLocation: 1,
      offset: 0,
      format: 'uint32x2' as const,
    },
  ],
};

const vertexShader = device.createShaderModule({ code: vertexProgram.code });
const fragmentShader = device.createShaderModule({ code: fragWGSL });
let commandEncoder: GPUCommandEncoder;

const cellsStride = {
  arrayStride: Uint32Array.BYTES_PER_ELEMENT,
  stepMode: 'instance' as const,
  attributes: [
    {
      shaderLocation: 0,
      offset: 0,
      format: 'uint32' as const,
    },
  ],
};

let msSinceLastTick = 0;
let render: () => void;
let applyDrawCanvas: () => void;
let renderChanges: () => void;

function resetGameData() {
  drawCanvasData = new Uint32Array(options.size * options.size);

  currentStateBuffer.write(
    runtime,
    Array.from({ length: 1024 ** 2 }, () => 0),
  );
  nextStateBuffer.write(
    runtime,
    Array.from({ length: 1024 ** 2 }, () => 0),
  );

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [computeProgram.bindGroupLayout],
    }),
    compute: {
      module: computeShader,
      constants: {
        blockSize: options.workgroupSize,
      },
    },
  });

  sizeBuffer.write(runtime, [options.size, options.size]);

  const length = options.size * options.size;
  const cells = new Uint32Array(length);

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [vertexProgram.bindGroupLayout],
    }),
    primitive: {
      topology: 'triangle-strip',
    },
    vertex: {
      module: vertexShader,
      buffers: [cellsStride, squareStride],
    },
    fragment: {
      module: fragmentShader,
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
  });

  render = () => {
    debugInfoBuffer.write(runtime, 0);
    const view = context.getCurrentTexture().createView();
    const renderPass: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
    commandEncoder = device.createCommandEncoder();

    // compute
    const passEncoderCompute = commandEncoder.beginComputePass();
    passEncoderCompute.setPipeline(computePipeline);
    passEncoderCompute.setBindGroup(0, computeProgram.bindGroup);
    passEncoderCompute.dispatchWorkgroups(
      options.size / options.workgroupSize,
      options.size / options.workgroupSize,
    );
    passEncoderCompute.end();

    commandEncoder.copyBufferToBuffer(
      runtime.bufferFor(nextStateBuffer),
      0,
      runtime.bufferFor(currentStateBuffer),
      0,
      cells.byteLength,
    );

    // render
    const passEncoderRender = commandEncoder.beginRenderPass(renderPass);
    passEncoderRender.setPipeline(renderPipeline);
    passEncoderRender.setVertexBuffer(0, runtime.bufferFor(currentStateBuffer));
    passEncoderRender.setVertexBuffer(1, squareBuffer);
    passEncoderRender.setBindGroup(0, vertexProgram.bindGroup);
    passEncoderRender.draw(4, length);
    passEncoderRender.end();

    device.queue.submit([commandEncoder.finish()]);
  };

  applyDrawCanvas = () => {
    const commandEncoder = device.createCommandEncoder();
    const stateBuffer = runtime.bufferFor(currentStateBuffer);

    for (let i = 0; i < options.size; i++) {
      for (let j = 0; j < options.size; j++) {
        if (drawCanvasData[j * options.size + i] === 0) {
          continue;
        }

        const index = j * options.size + i;
        device.queue.writeBuffer(
          stateBuffer,
          index * Uint32Array.BYTES_PER_ELEMENT,
          drawCanvasData,
          index,
          1,
        );
      }
    }

    device.queue.submit([commandEncoder.finish()]);
    drawCanvasData.fill(0);
  };

  renderChanges = () => {
    const view = context.getCurrentTexture().createView();
    const renderPass: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
    commandEncoder = device.createCommandEncoder();
    const passEncoderRender = commandEncoder.beginRenderPass(renderPass);
    passEncoderRender.setPipeline(renderPipeline);
    passEncoderRender.setVertexBuffer(0, runtime.bufferFor(currentStateBuffer));
    passEncoderRender.setVertexBuffer(1, squareBuffer);
    passEncoderRender.setBindGroup(0, vertexProgram.bindGroup);
    passEncoderRender.draw(4, length);
    passEncoderRender.end();

    device.queue.submit([commandEncoder.finish()]);
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
  const x = Math.floor(event.offsetX / cellSize);
  const y = options.size - Math.floor(event.offsetY / cellSize) - 1;
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

let paused = false;

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

resetGameData();

addParameter(
  'size',
  { initial: 64, options: [16, 32, 64, 128, 256, 512, 1024] },
  (value) => {
    options.size = value;
    resetGameData();
  },
);

addParameter(
  'timestep (ms)',
  { initial: 15, min: 15, max: 100, step: 1 },
  (value) => {
    options.timestep = value;
  },
);

addParameter(
  'stepsPerTimestep',
  { initial: 10, min: 1, max: 50, step: 1 },
  (value) => {
    options.stepsPerTimestep = value;
  },
);

addParameter(
  'workgroupSize',
  { initial: 16, options: [1, 2, 4, 8, 16] },
  (value) => {
    options.workgroupSize = value;
    resetGameData();
  },
);

addParameter(
  'viscosity',
  { initial: 1000, min: 10, max: 1000, step: 1 },
  (value) => {
    options.viscosity = value;
    viscosityBuffer.write(runtime, value);
  },
);

addParameter('brushSize', { initial: 0, min: 0, max: 10, step: 1 }, (value) => {
  options.brushSize = value;
});

addParameter(
  'brushType',
  { initial: 'water', options: BrushTypes },
  (value) => {
    options.brushType = value;
  },
);

addParameter('pause', { initial: false }, (value) => {
  paused = value;
});
