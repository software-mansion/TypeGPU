import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let workgroupSize = 16;
let gameWidth = 1024;
let gameHeight = 1024;
let timestep = 4;

let swap = false;
let paused = false;

const bindGroupLayoutCompute = tgpu.bindGroupLayout({
  size: {
    storage: d.vec2u,
    access: 'readonly',
  },
  current: {
    storage: (arrayLength: number) => d.arrayOf(d.u32, arrayLength),
    access: 'readonly',
  },
  next: {
    storage: (arrayLength: number) => d.arrayOf(d.u32, arrayLength),
    access: 'mutable',
  },
});

const bindGroupLayoutRender = tgpu.bindGroupLayout({
  size: {
    uniform: d.vec2u,
  },
});

const computeShader = device.createShaderModule({
  code: tgpu.resolve({
    template: `
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
    externals: {
      ...bindGroupLayoutCompute.bound,
    },
  }),
});

const squareBuffer = root
  .createBuffer(d.arrayOf(d.u32, 8), [0, 0, 1, 0, 0, 1, 1, 1])
  .$usage('vertex');

const squareVertexLayout = tgpu.vertexLayout(
  (n: number) => d.arrayOf(d.location(1, d.vec2u), n),
  'vertex',
);

const cellsVertexLayout = tgpu.vertexLayout(
  (n: number) => d.arrayOf(d.location(0, d.u32), n),
  'instance',
);

const renderShader = device.createShaderModule({
  code: tgpu.resolve({
    template: `
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) cell: f32,
}

@vertex
fn vert(@builtin(instance_index) i: u32, @location(0) cell: u32, @location(1) pos: vec2u) -> Out {
  let w = size.x;
  let h = size.y;
  let x = (f32(i % w + pos.x) / f32(w) - 0.5) * 2. * f32(w) / f32(max(w, h));
  let y = (f32((i - (i % w)) / w + pos.y) / f32(h) - 0.5) * 2. * f32(h) / f32(max(w, h));

  return Out(
    vec4f(x, y, 0., 1.),
    f32(cell),
  );
}

@fragment
fn frag(@location(0) cell: f32, @builtin(position) pos: vec4f) -> @location(0) vec4f {
  if (cell == 0.) {
    discard;
  }

  return vec4f(
    pos.x / 2048,
    pos.y / 2048,
    1 - pos.x / 2048,
    0.8
  );
}`,
    externals: {
      ...bindGroupLayoutRender.bound,
    },
  }),
});

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

let render: (swap: boolean) => void;
let loop: (swap: boolean) => void;

const resetGameData = () => {
  swap = false;
  const sizeBuffer = root
    .createBuffer(d.vec2u, d.vec2u(gameWidth, gameHeight))
    .$usage('uniform', 'storage');

  const length = gameWidth * gameHeight;
  const cells = Array.from({ length })
    .fill(0)
    .map(() => (Math.random() < 0.25 ? 1 : 0));

  const buffer0 = root
    .createBuffer(d.arrayOf(d.u32, length), cells)
    .$usage('storage', 'vertex');

  const buffer1 = root
    .createBuffer(d.arrayOf(d.u32, length))
    .$usage('storage', 'vertex');

  const bindGroup0 = root.createBindGroup(bindGroupLayoutCompute, {
    size: sizeBuffer,
    current: buffer0,
    next: buffer1,
  });

  const bindGroup1 = root.createBindGroup(bindGroupLayoutCompute, {
    size: sizeBuffer,
    current: buffer1,
    next: buffer0,
  });

  const uniformBindGroup = root.createBindGroup(bindGroupLayoutRender, {
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

    const commandEncoder = device.createCommandEncoder();
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
      const now = performance.now();
      if (!paused && now - lastRenderTime >= timestep) {
        render(swap);
        swap = !swap;
        lastRenderTime = now;
      }
      loop(swap);
    });
  };

  startGame();
};

let lastRenderTime: number;

const startGame = () => {
  lastRenderTime = performance.now();
  loop(swap);
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
    module: renderShader,
    buffers: [root.unwrap(cellsVertexLayout), root.unwrap(squareVertexLayout)],
  },
  fragment: {
    module: renderShader,
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
});

export const controls = {
  size: {
    initial: '64',
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

  Reset: {
    onButtonClick: resetGameData,
  },
};

export function onCleanup() {
  paused = true;
  root.destroy();
  root.device.destroy();
}
