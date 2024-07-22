/*
{
  "title": "Momentum Fluid Simulation"
}
*/

import { addElement, onFrame } from '@wigsill/example-toolkit';
import { createRuntime, f32, struct, vec2f, vec4f, wgsl } from 'wigsill';

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const runtime = await createRuntime();
const device = runtime.device;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const invAspectRatioBuffer = wgsl.buffer(f32).$allowUniform();
const invAspectRatioData = invAspectRatioBuffer.asUniform();

const vertexOutputStruct = struct({
  '@builtin(position) pos': vec4f,
  '@location(0) uv': vec2f,
});

const renderPipeline = runtime.makeRenderPipeline({
  vertex: {
    args: ['@builtin(vertex_index) VertexIndex: u32'],
    output: vertexOutputStruct,
    code: wgsl`
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

      var output: ${vertexOutputStruct};
      output.pos = vec4f(pos[VertexIndex].x * ${invAspectRatioData}, pos[VertexIndex].y, 0.0, 1.0);
      output.uv = uv[VertexIndex];
      return output;
    `,
  },

  fragment: {
    args: ['@builtin(position) pos: vec4f', '@location(0) uv: vec2f'],
    code: wgsl.code`
      return vec4(1.0, 1.0, 0.5, 1.0);
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

onFrame(() => {
  const textureView = context.getCurrentTexture().createView();
  invAspectRatioBuffer.write(runtime, canvas.clientHeight / canvas.clientWidth);

  renderPipeline.execute({
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],

    vertexCount: 4,
  });

  runtime.flush();
});
