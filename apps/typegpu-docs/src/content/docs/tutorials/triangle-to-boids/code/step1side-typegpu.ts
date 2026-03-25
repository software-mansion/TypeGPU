// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN

import { addButtonParameter, addElement, onFrame } from '@typegpu/example-toolkit';
import { builtin, createRuntime, wgsl } from 'typegpu';
import { arrayOf, vec2f } from 'typegpu/data';

const runtime = await createRuntime();

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const triangleVertex = wgsl
  .buffer(arrayOf(vec2f, 3), [
    [0.0, 0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
  ])
  .$allowVertex('vertex');

function randomizeVertices() {
  const vert = [
    [Math.random() - 0.5, Math.random()],
    [Math.random() - 1, Math.random() - 1],
    [Math.random(), Math.random() - 1],
  ] as [number, number][];
  runtime.writeBuffer(triangleVertex, vert);
}

addButtonParameter('Randomize', randomizeVertices);

const pipeline = runtime.makeRenderPipeline({
  vertex: {
    code: wgsl`
      let pos = vec4f(${triangleVertex.asVertex()}, 0.0, 1.0);
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
  pipeline.execute({
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

  runtime.flush();
});
