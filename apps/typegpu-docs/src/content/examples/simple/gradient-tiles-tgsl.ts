/*
{
  "title": "Gradient Tiles (TGSL)",
  "category": "simple"
}
*/

// -- Hooks into the example environment
import {
  addElement,
  addSliderPlumParameter,
  onCleanup,
  onFrame,
} from '@typegpu/example-toolkit';
// --

import { JitWebTranspiler } from '@typegpu/jit-web';
import { f32, struct, u32, vec2f, vec4f } from 'typegpu/data';
import {
  asUniform,
  builtin,
  createRuntime,
  tgpu,
  wgsl,
} from 'typegpu/experimental';

const xSpanPlum = addSliderPlumParameter('x span', 16, {
  min: 1,
  max: 16,
  step: 1,
});
const ySpanPlum = addSliderPlumParameter('y span', 16, {
  min: 1,
  max: 16,
  step: 1,
});

const spanPlum = wgsl.plum((get) => ({ x: get(xSpanPlum), y: get(ySpanPlum) }));
const spanBuffer = wgsl
  .buffer(struct({ x: u32, y: u32 }), spanPlum)
  .$usage(tgpu.Uniform)
  .$name('span');
const spanUniform = asUniform(spanBuffer);

const runtime = await createRuntime({ jitTranspiler: new JitWebTranspiler() });
const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: runtime.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const VertexOutput = struct({ uv: vec2f });

const vertexStep = tgpu
  .fn([], VertexOutput)
  .implement(() => {
    const pos = [
      vec2f(1, 1), // top-right
      vec2f(-1, 1), // top-left
      vec2f(1, -1), // bottom-right
      vec2f(-1, -1), // bottom-left
    ];

    const uv = [
      vec2f(1, 1), // top-right
      vec2f(0, 1), // top-left
      vec2f(1, 0), // bottom-right
      vec2f(0, 0), // bottom-left
    ];

    return {
      [builtin.position]: vec4f(pos[builtin.vertexIndex], 0.0, 1.0),
      uv: uv[builtin.vertexIndex],
    };
  })
  .$uses({});

const fragmentStep = tgpu
  .fn([VertexOutput])
  .implement((input) => {
    const span = spanUniform.value;
    const red = std.floor(input.uv.x * f32(span.x)) / f32(span.x);
    const green = std.floor(input.uv.y * f32(span.y)) / f32(span.y);
    return vec4f(red, green, 0.5, 1.0);
  })
  .$uses({ spanUniform });

onFrame(() => {
  const textureView = context.getCurrentTexture().createView();

  runtime.render(vertexStep, fragmentStep, {
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],

    target: [
      {
        format: presentationFormat,
      },
    ],

    primitive: {
      topology: 'triangle-strip',
    },

    vertexCount: 4,
  });

  runtime.flush();
});

onCleanup(() => {
  runtime.dispose();
});
