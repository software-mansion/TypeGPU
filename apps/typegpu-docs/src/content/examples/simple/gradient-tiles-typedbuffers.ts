/*
{
  "title": "Gradient Tiles",
  "category": "simple"
}
*/

import tgpu from 'typegpu';
import { struct, u32 } from 'typegpu/data';

if (!navigator.gpu) {
  throw new Error('WebGPU is not supported by this browser.');
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('Could not find a compatible GPU.');
}
const device = await adapter.requestDevice();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const vertWGSL = `
struct Output {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}
@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
) -> Output {
  var pos = array<vec2f, 4>(
    vec2(1, 1), // top-right
    vec2(-1, 1), // top-left
    vec2(1, -1), // bottom-right
    vec2(-1, -1) // bottom-left
  );
  var uv = array<vec2f, 4>(
    vec2(1., 1.), // top-right
    vec2(0., 1.), // top-left
    vec2(1., 0.), // bottom-right
    vec2(0., 0.) // bottom-left
  );
  var out: Output;
  out.pos = vec4f(pos[vertexIndex], 0.0, 1.0);
  out.uv = uv[vertexIndex];
  return out;
}`;

const fragWGSL = `
struct Span {
  x: u32,
  y: u32,
}
@group(0) @binding(0) var<uniform> span: Span;
@fragment
fn main(
  @location(0) uv: vec2f,
) -> @location(0) vec4f {
  let red = floor(uv.x * f32(span.x)) / f32(span.x);
  let green = floor(uv.y * f32(span.y)) / f32(span.y);
  return vec4(red, green, 0.5, 1.0);
}`;

context.configure({
  device: device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const Span = struct({
  x: u32,
  y: u32,
});

const spanBuffer = tgpu
  .createBuffer(Span, { x: 10, y: 10 })
  .$device(device)
  .$usage(tgpu.Uniform);

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: device.createShaderModule({
      code: vertWGSL,
    }),
  },
  fragment: {
    module: device.createShaderModule({
      code: fragWGSL,
    }),
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

const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: spanBuffer.buffer,
      },
    },
  ],
});

const draw = (spanXValue: number, spanYValue: number) => {
  const textureView = context.getCurrentTexture().createView();
  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  tgpu.write(spanBuffer, { x: spanXValue, y: spanYValue });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.draw(4);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
};

let spanX = 10;
let spanY = 10;

// deferring to wait for canvas to init
setTimeout(() => {
  draw(spanX, spanY);
}, 100);

/** @button "↔️ -" */
export function spanXMinus() {
  spanX = Math.max(1, spanX - 1);
  draw(spanX, spanY);
}

/** @button "↔️ +" */
export function spanXPlus() {
  spanX = Math.min(spanX + 1, 20);
  draw(spanX, spanY);
}

/** @button "↕️ -" */
export function spanYMinus() {
  spanY = Math.max(1, spanY - 1);
  draw(spanX, spanY);
}

/** @button "↕️ +" */
export function spanYPlus() {
  spanY = Math.min(spanY + 1, 20);
  draw(spanX, spanY);
}
