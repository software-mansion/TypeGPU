import tgpu from 'typegpu';
import { struct, u32 } from 'typegpu/data';

const root = await tgpu.init();
const device = root.device;

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

const spanBuffer = root.createBuffer(Span, { x: 10, y: 10 }).$usage('uniform');

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

  spanBuffer.write({ x: spanXValue, y: spanYValue });

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

// #region Example controls and cleanup

export const controls = {
  'x span ↔️': {
    initial: spanY,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange: (newValue: number) => {
      spanX = newValue;
      draw(spanX, spanY);
    },
  },

  'y span ↕️': {
    initial: spanY,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange: (newValue: number) => {
      spanY = newValue;
      draw(spanX, spanY);
    },
  },
};

export function onCleanup() {
  root.destroy();
  device.destroy();
}

// #endregion
