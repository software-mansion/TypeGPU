// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN

import {
  addElement,
  addSliderPlumParameter,
  onFrame,
} from '@typegpu/example-toolkit';
import { builtin, createRuntime, wgsl } from 'typegpu';
import { arrayOf, f32, vec2f } from 'typegpu/data';

const runtime = await createRuntime();

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const params = {
  rotation: addSliderPlumParameter('rotation (rad)', 0, {
    min: 0,
    max: 3.14 * 2,
    step: 0.1,
  }),
  x: addSliderPlumParameter('x', 0, {
    min: -1,
    max: 1,
    step: 0.1,
  }),
  y: addSliderPlumParameter('y', 0, {
    min: -1,
    max: 1,
    step: 0.1,
  }),
};

const rotationBuffer = wgsl.buffer(f32, params.rotation).$allowUniform();
const xBuffer = wgsl.buffer(f32, params.x).$allowUniform();
const yBuffer = wgsl.buffer(f32, params.y).$allowUniform();

const triangleVertex = wgsl
  .buffer(arrayOf(vec2f, 3), [
    [0.0, 0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
  ])
  .$allowVertex('vertex');

const rotate = wgsl.fn`(v: vec2f, angle: f32) -> vec2f {
  let pos = vec2(
    (v.x * cos(angle)) - (v.y * sin(angle)),
    (v.x * sin(angle)) + (v.y * cos(angle))
  );
  return pos;
}`;

const pipeline = runtime.makeRenderPipeline({
  vertex: {
    code: wgsl`
      let rotated = ${rotate}(
        ${triangleVertex.asVertex()},
        ${rotationBuffer.asUniform()}
      );

      let offset = vec2f(
        ${xBuffer.asUniform()},
        ${yBuffer.asUniform()}
      );

      let pos = vec4f(rotated + offset, 0.0, 1.0);
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
