/*
{
  "title": "Gradient Tiles"
}
*/

import {
  addElement,
  addParameter,
  onCleanup,
  onFrame,
} from '@wigsill/example-toolkit';
import { ProgramBuilder, createRuntime, makeArena, u32, wgsl } from 'wigsill';

const runtime = await createRuntime();
const device = runtime.device;

const xSpanData = wgsl.memory(u32).$name('x-span');
const ySpanData = wgsl.memory(u32).$name('y-span');

const mainArena = makeArena({
  bufferBindingType: 'uniform',
  memoryEntries: [xSpanData, ySpanData],
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});

const canvas = await addElement('canvas');

const context = canvas.getContext('webgpu') as GPUCanvasContext;

const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const mainCode = wgsl`
struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main_vert(
  @builtin(vertex_index) VertexIndex: u32
) -> VertexOutput {
  var pos = array<vec2f, 4>(
    vec2(0.5, 0.5), // top-right
    vec2(-0.5, 0.5), // top-left
    vec2(0.5, -0.5), // bottom-right
    vec2(-0.5, -0.5) // bottom-left
  );

  var uv = array<vec2f, 4>(
    vec2(1., 1.), // top-right
    vec2(0., 1.), // top-left
    vec2(1., 0.), // bottom-right
    vec2(0., 0.) // bottom-left
  );

  var output: VertexOutput;
  output.pos = vec4f(pos[VertexIndex], 0.0, 1.0);
  output.uv = uv[VertexIndex];
  return output;
}

@fragment
fn main_frag(
  @builtin(position) Position: vec4f,
  @location(0) uv: vec2f,
) -> @location(0) vec4f {
  let red = floor(uv.x * f32(${xSpanData})) / f32(${xSpanData});
  let green = floor(uv.y * f32(${ySpanData})) / f32(${ySpanData});
  return vec4(red, green, 0.5, 1.0);
}
  `;

const program = new ProgramBuilder(runtime, mainCode).build({
  bindingGroup: 0,
  shaderStage: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
  arenas: [mainArena],
});

const shaderModule = device.createShaderModule({
  code: program.code,
});

const pipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [program.bindGroupLayout],
  }),
  vertex: {
    module: shaderModule,
    entryPoint: 'main_vert',
  },
  fragment: {
    module: shaderModule,
    entryPoint: 'main_frag',
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-strip',
  },
});

addParameter(
  'x-span',
  { initial: 16, min: 1, max: 16, step: 1 },
  (xSpan: number) => xSpanData.write(runtime, xSpan),
);

addParameter(
  'y-span',
  { initial: 16, min: 1, max: 16, step: 1 },
  (ySpan: number) => ySpanData.write(runtime, ySpan),
);

onFrame(() => {
  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, program.bindGroup);
  passEncoder.draw(4);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
});

onCleanup(() => {
  // TODO: Clean up
});
