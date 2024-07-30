/*
{
  "title": "Gradient Tiles",
  "category": "simple"
}
*/

// -- Hooks into the example environment
import {
  addElement,
  addParameter,
  onCleanup,
  onFrame,
} from '@wigsill/example-toolkit';
// --

import wgsl, { builtin } from 'wigsill';
import { u32, vec2f } from 'wigsill/data';
import { createRuntime } from 'wigsill/web';

const runtime = await createRuntime();
const device = runtime.device;

const xSpanBuffer = wgsl.buffer(u32).$name('x-span').$allowUniform();
const ySpanBuffer = wgsl.buffer(u32).$name('y-span').$allowUniform();

const xSpanData = xSpanBuffer.asUniform();
const ySpanData = ySpanBuffer.asUniform();

const canvas = await addElement('canvas', { aspectRatio: 1 });
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
      uvOut: [vec2f, 'uv'],
    },
  },

  fragment: {
    code: wgsl.code`
      let red = floor(uvOut.x * f32(${xSpanData})) / f32(${xSpanData});
      let green = floor(uvOut.y * f32(${ySpanData})) / f32(${ySpanData});
      return vec4(red, green, 0.5, 1.0);
    `,
    target: [
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
  (xSpan: number) => runtime.writeBuffer(xSpanBuffer, xSpan),
);

addParameter(
  'y-span',
  { initial: 16, min: 1, max: 16, step: 1 },
  (ySpan: number) => runtime.writeBuffer(ySpanBuffer, ySpan),
);

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
  // TODO: Clean up
});
