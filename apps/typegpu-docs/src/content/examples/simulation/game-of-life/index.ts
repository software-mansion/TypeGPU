import tgpu, { type TgpuBuffer, Storage } from 'typegpu';
import { arrayOf, type TgpuArray, type U32, u32, vec2u } from 'typegpu/data';

const bindGroupLayoutCompute = tgpu.bindGroupLayout({
  size: {
    storage: vec2u,
    access: 'readonly',
  },
  current: {
    storage: (arrayLength: number) => arrayOf(u32, arrayLength),
    access: 'readonly',
  },
  next: {
    storage: (arrayLength: number) => arrayOf(u32, arrayLength),
    access: 'mutable',
  },
});
const bindGroupLayoutRender = tgpu.bindGroupLayout({
  size: {
    uniform: vec2u,
  },
});

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
});

const GameOptions = {
  width: 128,
  height: 128,
  timestep: 4,
  workgroupSize: 8,
  maxIters: 1000,
};

const computeShader = device.createShaderModule({
  code: `
@binding(0) @group(0) var<storage, read> size: vec2u;
@binding(1) @group(0) var<storage, read> current: array<u32>;
@binding(2) @group(0) var<storage, read_write> next: array<u32>;

override blockSize = 8;

fn getIndex(x: u32, y: u32) -> u32 {
  let h = size.y;
  let w = size.x;

  return (y % h) * w + (x % w);
}

fn getCell(x: u32, y: u32) -> u32 {
  return current[getIndex(x, y)];
}

fn countNeighbors(x: u32, y: u32) -> u32 {
  return getCell(x - 1, y - 1) + getCell(x, y - 1) + getCell(x + 1, y - 1) + 
         getCell(x - 1, y) +                         getCell(x + 1, y) + 
         getCell(x - 1, y + 1) + getCell(x, y + 1) + getCell(x + 1, y + 1);
}

@compute @workgroup_size(blockSize, blockSize)
fn main(@builtin(global_invocation_id) grid: vec3u) {
  let x = grid.x;
  let y = grid.y;
  let n = countNeighbors(x, y);
  next[getIndex(x, y)] = select(u32(n == 3u), u32(n == 2u || n == 3u), getCell(x, y) == 1u); 
} 
`,
});

const squareBuffer = root
  .createBuffer(arrayOf(u32, 8), [0, 0, 1, 0, 0, 1, 1, 1])
  .$usage('vertex');

const squareStride: GPUVertexBufferLayout = {
  arrayStride: 2 * Uint32Array.BYTES_PER_ELEMENT,
  stepMode: 'vertex',
  attributes: [
    {
      shaderLocation: 1,
      offset: 0,
      format: 'uint32x2',
    },
  ],
};

const vertexShader = device.createShaderModule({
  code: `
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) cell: f32,
}

@binding(0) @group(0) var<uniform> size: vec2u;

@vertex
fn main(@builtin(instance_index) i: u32, @location(0) cell: u32, @location(1) pos: vec2u) -> Out {
  let w = size.x;
  let h = size.y;
  let x = (f32(i % w + pos.x) / f32(w) - 0.5) * 2. * f32(w) / f32(max(w, h));
  let y = (f32((i - (i % w)) / w + pos.y) / f32(h) - 0.5) * 2. * f32(h) / f32(max(w, h));

  return Out(
    vec4f(x, y, 0., 1.),
    f32(cell),
  );
}`,
});
const fragmentShader = device.createShaderModule({
  code: `
@fragment
fn main(@location(0) cell: f32, @builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(
    max(f32(cell) * pos.x / 1024, 0), 
    max(f32(cell) * pos.y / 1024, 0), 
    max(f32(cell) * (1 - pos.x / 1024), 0),
    1.
  );
}`,
});
let commandEncoder: GPUCommandEncoder;

const cellsStride: GPUVertexBufferLayout = {
  arrayStride: Uint32Array.BYTES_PER_ELEMENT,
  stepMode: 'instance',
  attributes: [
    {
      shaderLocation: 0,
      offset: 0,
      format: 'uint32',
    },
  ],
};

let wholeTime = 0,
  stepTime = 0,
  buffer0: TgpuBuffer<TgpuArray<U32>> & Storage,
  buffer1: TgpuBuffer<TgpuArray<U32>> & Storage;

// compute pipeline
const computePipeline = device.createComputePipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(bindGroupLayoutCompute)],
  }),
  compute: {
    module: computeShader,
    constants: {
      blockSize: GameOptions.workgroupSize,
    },
  },
});
const sizeBuffer = root
  .createBuffer(vec2u, vec2u(GameOptions.width, GameOptions.height))
  .$usage('uniform')
  .$usage('storage');
const length = GameOptions.width * GameOptions.height;
const cells = Array.from({ length }).fill(0) as number[];
for (let i = 0; i < length; i++) {
  cells[i] = Math.random() < 0.25 ? 1 : 0;
}
buffer0 = root
  .createBuffer(arrayOf(u32, length), cells)
  .$usage('storage')
  .$usage('vertex');
buffer1 = root
  .createBuffer(arrayOf(u32, length))
  .$usage('storage')
  .$usage('vertex');

const bindGroup0 = bindGroupLayoutCompute.populate({
  size: sizeBuffer,
  current: buffer0,
  next: buffer1,
});

const bindGroup1 = bindGroupLayoutCompute.populate({
  size: sizeBuffer,
  current: buffer1,
  next: buffer0,
});

const renderPipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(bindGroupLayoutRender)],
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

const uniformBindGroup = bindGroupLayoutRender.populate({
  size: sizeBuffer,
});

const render = (swap: boolean) => {
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
  passEncoderCompute.setBindGroup(
    0,
    root.unwrap(swap ? bindGroup1 : bindGroup0),
  );
  passEncoderCompute.dispatchWorkgroups(
    GameOptions.width / GameOptions.workgroupSize,
    GameOptions.height / GameOptions.workgroupSize,
  );
  passEncoderCompute.end();
  // render
  const passEncoderRender = commandEncoder.beginRenderPass(renderPass);
  passEncoderRender.setPipeline(renderPipeline);
  passEncoderRender.setVertexBuffer(0, root.unwrap(swap ? buffer1 : buffer0));
  passEncoderRender.setVertexBuffer(1, root.unwrap(squareBuffer));
  passEncoderRender.setBindGroup(0, root.unwrap(uniformBindGroup));
  passEncoderRender.draw(4, length);
  passEncoderRender.end();
  device.queue.submit([commandEncoder.finish()]);
};

let swap = false;

function loop() {
  if (wholeTime >= GameOptions.maxIters) return;
  if (GameOptions.timestep) {
    wholeTime++;
    stepTime++;
    if (stepTime >= GameOptions.timestep) {
      render(swap);
      stepTime -= GameOptions.timestep;
      swap = !swap;
    }
  }

  requestAnimationFrame(loop);
}
