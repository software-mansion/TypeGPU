// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN

import { addElement, onFrame } from '@typegpu/example-toolkit';
import tgpu, { builtin } from 'typegpu/experimental';

const root = await tgpu.init();

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const renderPipeline = root.makeRenderPipeline({
  vertex: {
    code: wgsl`
      var verticies = array<vec2f, 3>(
        vec2(0.0, 0.5),
        vec2(-0.5, -0.5),
        vec2(0.5, -0.5)
      );

      let pos = vec4f(verticies[${builtin.vertexIndex}], 0.0, 1.0);
    `,
    output: {
      [builtin.position]: 'pos',
    },
  },
  fragment: {
    code: wgsl`
      return vec4(0.7686, 0.3922, 1., 1.0);
    `,
    target: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

onFrame(() => {
  renderPipeline.execute({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    vertexCount: 3,
  });

  root.flush();
});
