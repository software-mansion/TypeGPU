"use strict";
import tgpu from "typegpu";
import * as d from "typegpu/data";

let gameWidth = 1024;
let gameHeight = 1024;
let gridWidth = 32;
let gridHeight = 32;

const computeShaderString = `override blockSize = 16;
  
fn getCell(x: u32, y: u32) -> f32 {
  let h = size.y;
  let w = size.x;
  return memory[(y % h) * w + (x % w)];
}

fn getGradientsGridIndexes(position: vec3u, xShift: u32, yShift: u32) -> vec2u {
  return vec2u((position.x / gradientsCellSize.x) + xShift, (position.y / gradientsCellSize.y) + yShift);
}

fn smootherstep(x: f32) -> f32 {
  return  6 * pow(x, 5) - 15 * pow(x, 4) + 10 * pow(x, 3);
}
fn interpolate(x: f32, a: f32, b: f32) -> f32 {
  return a + smootherstep(x) * (b - a);
}

fn dotProdGrid(position: vec3u, gradientsGridPosition: vec2u) -> f32 {
  let positionInAGridCell: vec2f = vec2f(
    f32(position.x) / f32(gradientsCellSize.x) - f32(gradientsGridPosition.x),
    f32(position.y) / f32(gradientsCellSize.y) - f32(gradientsGridPosition.y),
  );
  let gridVector: vec2f = gradients[gradientsGridPosition.x + gradientsGridPosition.y * (gradientsGridSize.x + 1)];
  return (
    positionInAGridCell.x * gridVector.x +
    positionInAGridCell.y * gridVector.y
  );
}

fn calculateValuePerPosition(position: vec3u, index: u32) -> f32 {
  let gradientsGridPosition: vec2u = getGradientsGridIndexes(position, 0, 0);
  let positionInAGridCell: vec2f = vec2f(
    f32(position.x) / f32(gradientsCellSize.x) - f32(gradientsGridPosition.x), 
    f32(position.y) / f32(gradientsCellSize.y) - f32(gradientsGridPosition.y)
  );
  let topLeft: f32 = dotProdGrid(position, gradientsGridPosition);
  let topRight: f32 = dotProdGrid(position, getGradientsGridIndexes(position, 1, 0));
  let bottomLeft: f32 = dotProdGrid(position, getGradientsGridIndexes(position, 0, 1));
  let bottomRight: f32 = dotProdGrid(position, getGradientsGridIndexes(position, 1, 1));
  let topValueToInterpolate: f32 = interpolate(positionInAGridCell.x, topLeft, topRight);
  let bottomValueToInterpolate: f32 = interpolate(positionInAGridCell.x, bottomLeft, bottomRight);
  let interpolatedValue: f32 = interpolate(positionInAGridCell.y, topValueToInterpolate, bottomValueToInterpolate);
  return interpolatedValue;
}

@compute @workgroup_size(blockSize, blockSize)
fn main(@builtin(global_invocation_id) grid: vec3u) {
  let index: u32 = grid.x + grid.y * size.x;
  let val: f32 = calculateValuePerPosition(grid, index);
  memory[index] = val;
}
`;

const renderShaderString = `struct Out {
    @builtin(position) pos: vec4f,
    @location(0) cell: f32,
    @location(1) uv: vec2f,
}
  
@vertex
fn vert(@builtin(instance_index) i: u32, @location(0) cell: f32, @location(1) pos: vec2u) -> Out {
    let w = size.x;
    let h = size.y;
    let x = (f32(i % w + pos.x) / f32(w) - 0.5) * 2. * f32(w) / f32(max(w, h));
    let y = (f32((i - (i % w)) / w + pos.y) / f32(h) - 0.5) * 2. * f32(h) / f32(max(w, h));
  
    return Out(vec4f(x, y, 0., 1.), cell, vec2f(x,y));
}
  
@fragment
fn frag(@location(0) cell: f32, @builtin(position) pos: vec4f) -> @location(0) vec4f {  
    return vec4f((cell + 1.)/2., 0, 1. - (cell + 1.)/2., 1);
}`;

const root = await tgpu.init();

const startupTGPU = async () => {
  const device = root.device;

  const canvas = document.querySelector("canvas") as HTMLCanvasElement;
  const context = canvas.getContext("webgpu") as GPUCanvasContext;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "premultiplied",
  });

  let workgroupSize = 16;

  const bindGroupLayoutCompute = tgpu.bindGroupLayout({
    memory: {
      storage: (arrayLength: number) => d.arrayOf(d.f32, arrayLength),
      access: "mutable",
    },
    gradients: {
      storage: (arrayLength: number) => d.arrayOf(d.vec2f, arrayLength),
      access: "readonly",
    },
    size: {
      storage: d.vec2u,
      access: "readonly",
    },
    gradientsGridSize: {
      storage: d.vec2u,
      access: "readonly",
    },
    gradientsCellSize: {
      storage: d.vec2u,
      access: "readonly",
    },
  });
  const bindGroupLayoutRender = tgpu.bindGroupLayout({
    size: {
      uniform: d.vec2u,
    },
  });

  const computeShader = device.createShaderModule({
    code: tgpu.resolve({
      template: computeShaderString,
      externals: {
        ...bindGroupLayoutCompute.bound,
      },
    }),
  });

  const renderShader = device.createShaderModule({
    code: tgpu.resolve({
      template: renderShaderString,
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

  const squareVertexLayout = tgpu.vertexLayout(
    (n: number) => d.arrayOf(d.location(1, d.vec2u), n),
    "vertex"
  );

  const memoryVertexLayout = tgpu.vertexLayout(
    (n: number) => d.arrayOf(d.location(0, d.f32), n),
    "instance"
  );

  const memoryLength = gameWidth * gameHeight;
  const memory = Array.from({ length: memoryLength }).fill(0) as Array<number>;
  const gradientsGridSizes = [gridWidth + 1, gridHeight + 1];

  const gradientsLength = gradientsGridSizes[0] * gradientsGridSizes[1];
  const gradients = Array.from({ length: gradientsLength })
    .fill(0)
    .map(() => {
      const theta = Math.random() * 2 * Math.PI;
      return d.vec2f(Math.cos(theta), Math.sin(theta));
    });

  const memoryBuffer = root
    .createBuffer(d.arrayOf(d.f32, memoryLength), memory)
    .$usage("storage", "vertex");

  const gradientsBuffer = root
    .createBuffer(d.arrayOf(d.vec2f, gradientsLength), gradients)
    .$usage("uniform", "storage");

  const sizeBuffer = root
    .createBuffer(d.vec2u, d.vec2u(gameWidth, gameHeight))
    .$usage("uniform", "storage");

  const squareBuffer = root
    .createBuffer(d.arrayOf(d.u32, 8), [0, 0, 1, 0, 0, 1, 1, 1])
    .$usage("vertex");

  const gradientsGridSizeBuffer = root
    .createBuffer(
      d.vec2u,
      d.vec2u(gradientsGridSizes[0] - 1, gradientsGridSizes[1] - 1)
    )
    .$usage("uniform", "storage");

  const gradientsCellSizeBuffer = root
    .createBuffer(
      d.vec2u,
      d.vec2u(
        Math.round(gameWidth / (gradientsGridSizes[0] - 1)),
        Math.round(gameHeight / (gradientsGridSizes[1] - 1))
      )
    )
    .$usage("uniform", "storage");

  const bindGroup = root.createBindGroup(bindGroupLayoutCompute, {
    size: sizeBuffer,
    memory: memoryBuffer,
    gradients: gradientsBuffer,
    gradientsGridSize: gradientsGridSizeBuffer,
    gradientsCellSize: gradientsCellSizeBuffer,
  });

  const uniformBindGroup = root.createBindGroup(bindGroupLayoutRender, {
    size: sizeBuffer,
  });

  const view = context.getCurrentTexture().createView();
  const renderPass: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view,
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  };

  const commandEncoder = device.createCommandEncoder();
  const passEncoderCompute = commandEncoder.beginComputePass();

  passEncoderCompute.setPipeline(computePipeline);
  passEncoderCompute.setBindGroup(0, root.unwrap(bindGroup));

  passEncoderCompute.dispatchWorkgroups(
    gameWidth / workgroupSize,
    gameHeight / workgroupSize
  );
  passEncoderCompute.end();

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayoutRender)],
    }),
    primitive: {
      topology: "triangle-strip",
    },
    vertex: {
      module: renderShader,
      buffers: [
        root.unwrap(memoryVertexLayout),
        root.unwrap(squareVertexLayout),
      ],
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

  const passEncoderRender = commandEncoder.beginRenderPass(renderPass);
  passEncoderRender.setPipeline(renderPipeline);

  passEncoderRender.setVertexBuffer(0, root.unwrap(memoryBuffer));
  passEncoderRender.setVertexBuffer(1, root.unwrap(squareBuffer));
  passEncoderRender.setBindGroup(0, root.unwrap(uniformBindGroup));

  passEncoderRender.draw(4, memoryLength);
  passEncoderRender.end();
  device.queue.submit([commandEncoder.finish()]);
};

startupTGPU();



export const controls = {
  size: {
    initial: '64',
    options: [16, 32, 64, 128, 256, 512, 1024, 2048, 4096].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      gameWidth = Number.parseInt(value);
      gameHeight = Number.parseInt(value);
      startupTGPU();
    },
  },

  'grid size': {
    initial: '16',
    options: [1, 2, 4, 8, 16, 32, 64, 128, 256].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      gridHeight = Number.parseInt(value);
      gridWidth = Number.parseInt(value);
      startupTGPU();
    },
  },

  Reset: {
    onButtonClick: startupTGPU,
  },
};

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}

