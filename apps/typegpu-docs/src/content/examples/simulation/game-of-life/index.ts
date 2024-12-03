import tgpu, { type TgpuBindGroup, type TgpuBuffer, Storage } from 'typegpu';
import { arrayOf, type TgpuArray, type U32, u32, vec2u } from 'typegpu/data';

const layoutCompute = {
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
} as const;
const groupLayout = {
  size: {
    uniform: vec2u,
  },
} as const;

const bindGroupLayoutCompute = tgpu.bindGroupLayout(layoutCompute);
const bindGroupLayoutRender = tgpu.bindGroupLayout(groupLayout);

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

let workgroupSize = 16;
let gameWidth = 1024;
let gameHeight = 1024;
let timestep = 4;

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

let buffer0: TgpuBuffer<TgpuArray<U32>> & Storage,
  sizeBuffer,
  bindGroup0: TgpuBindGroup<typeof layoutCompute>,
  bindGroup1: TgpuBindGroup<typeof layoutCompute>,
  uniformBindGroup: TgpuBindGroup<typeof groupLayout>,
  buffer1: TgpuBuffer<TgpuArray<U32>> & Storage;

// compute pipeline
const computePipeline = device.createComputePipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(bindGroupLayoutCompute)],
  }),
  compute: {
    module: computeShader,
    constants: {
      blockSize: workgroupSize,
    },
  },
});
let currentInterval: NodeJS.Timer | undefined;
let render: (swap: boolean) => void;
let loop: (swap: boolean) => void;
const resetGameData = () => {
  sizeBuffer = root
    .createBuffer(vec2u, vec2u(gameWidth, gameHeight))
    .$usage('uniform')
    .$usage('storage');
  const length = gameWidth * gameHeight;
  const cells = Array.from({ length })
    .fill(0)
    .map((_, i) => (Math.random() < 0.25 ? 1 : 0));
  buffer0 = root
    .createBuffer(arrayOf(u32, length), cells)
    .$usage('storage')
    .$usage('vertex');
  buffer1 = root
    .createBuffer(arrayOf(u32, length))
    .$usage('storage')
    .$usage('vertex');

  bindGroup0 = bindGroupLayoutCompute.populate({
    size: sizeBuffer,
    current: buffer0,
    next: buffer1,
  });

  bindGroup1 = bindGroupLayoutCompute.populate({
    size: sizeBuffer,
    current: buffer1,
    next: buffer0,
  });
  uniformBindGroup = bindGroupLayoutRender.populate({
    size: sizeBuffer,
  });

  render = (swap: boolean) => {
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
      gameWidth / workgroupSize,
      gameHeight / workgroupSize,
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
  loop = () => {
    requestAnimationFrame(() => {
      if (!paused) {
        render(swap);
        swap = !swap;
      }
    });
  };
  startGame();
};

const startGame = () => {
  if (currentInterval) clearInterval(currentInterval as unknown as number);
  currentInterval = setInterval(() => {
    loop(swap);
  }, timestep);
};

resetGameData();

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

let swap = false;
let paused = false;

export const controls = {
  size: {
    initial: '1024',
    options: [16, 32, 64, 128, 256, 512, 1024].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      gameWidth = Number.parseInt(value);
      gameHeight = Number.parseInt(value);
      resetGameData();
    },
  },

  'timestep (ms)': {
    initial: 15,
    min: 15,
    max: 100,
    step: 1,
    onSliderChange: (value: number) => {
      timestep = value;
      startGame();
    },
  },

  'workgroup size': {
    initial: '16',
    options: [1, 2, 4, 8, 16].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      workgroupSize = Number.parseInt(value);
      resetGameData();
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
  root.destroy();
  root.device.destroy();
}
