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

import wgsl from 'wigsill';
import { struct, u32, vec2f, vec4f } from 'wigsill/data';
import { createRuntime } from 'wigsill/web';

const xSpanPlum = wgsl.plum<number>(16).$name('x_span');
const ySpanPlum = wgsl.plum<number>(16).$name('y_span');

const runtime = await createRuntime();
const device = runtime.device;

const xSpanBuffer = wgsl.buffer(u32).$name('x-span').$allowUniform();
const ySpanBuffer = wgsl.buffer(u32).$name('y-span').$allowUniform();

runtime.onPlumChange(xSpanPlum, () => {
  runtime.writeBuffer(xSpanBuffer, runtime.readPlum(xSpanPlum));
});

runtime.onPlumChange(ySpanPlum, () => {
  runtime.writeBuffer(ySpanBuffer, runtime.readPlum(ySpanPlum));
});

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

const outputStruct = struct({
  '@builtin(position) pos': vec4f,
  '@location(0) uv': vec2f,
});

const renderPipeline = runtime.makeRenderPipeline({
  vertex: {
    args: ['@builtin(vertex_index) VertexIndex: u32'],
    output: outputStruct,
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

      var output: ${outputStruct};
      output.pos = vec4f(pos[VertexIndex] * 0.9, 0.0, 1.0);
      output.uv = uv[VertexIndex];
      return output;
    `,
  },

  fragment: {
    args: ['@builtin(position) Position: vec4f', '@location(0) uv: vec2f'],
    code: wgsl.code`
      let red = floor(uv.x * f32(${xSpanData})) / f32(${xSpanData});
      let green = floor(uv.y * f32(${ySpanData})) / f32(${ySpanData});
      return vec4(red, green, 0.5, 1.0);
    `,
    output: '@location(0) vec4f',
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

addParameter('x-span', { initial: 16, min: 1, max: 16, step: 1 }, (value) =>
  runtime.setPlum(xSpanPlum, value),
);

addParameter('y-span', { initial: 16, min: 1, max: 16, step: 1 }, (value) =>
  runtime.setPlum(ySpanPlum, value),
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
