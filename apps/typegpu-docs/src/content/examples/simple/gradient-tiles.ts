/*
{
  "title": "Gradient Tiles",
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

import { builtin, createRuntime, wgsl } from 'typegpu';
import { struct, u32, vec2f } from 'typegpu/data';

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
  .$name('span')
  .$allowUniform();

const runtime = await createRuntime();
const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: runtime.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const renderPipeline = runtime.makeRenderPipeline({
  vertex: {
    code: wgsl`
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

      let posOut = vec4f(pos[${builtin.vertexIndex}], 0.0, 1.0);
      let uvOut = uv[${builtin.vertexIndex}];
    `,
    output: {
      [builtin.position]: 'posOut',
      uvOut: vec2f,
    },
  },

  fragment: {
    code: wgsl.code`
      let span = ${spanBuffer.asUniform()};
      let red = floor(uvOut.x * f32(span.x)) / f32(span.x);
      let green = floor(uvOut.y * f32(span.y)) / f32(span.y);
      return vec4(red, green, 0.5, 1.0);
    `,
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

onFrame(() => {
  const textureView = context.getCurrentTexture().createView();

  renderPipeline.execute({
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],

    vertexCount: 4,
  });

  runtime.flush();
});

onCleanup(() => {
  runtime.dispose();
});
