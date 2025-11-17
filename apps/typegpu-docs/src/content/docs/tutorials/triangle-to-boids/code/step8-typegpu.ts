// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN

import { addButtonParameter, addElement, onFrame } from '@typegpu/example-toolkit';
import {
  builtin,
  createRuntime,
  type TgpuBufferMutable,
  type TgpuBufferUniform,
  wgsl,
} from 'typegpu';
import { arrayOf, struct, vec2f } from 'typegpu/data';

const runtime = await createRuntime();

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

addButtonParameter('Randomize', randomizeTriangles);

const triangleSize = 0.2;
const triangleVertex = wgsl
  .buffer(arrayOf(vec2f, 3), [
    [0.0, triangleSize],
    [-triangleSize, -triangleSize],
    [triangleSize, -triangleSize],
  ])
  .$allowVertex('vertex');

const triangleAmount = 10;
const trianglePosData = arrayOf(
  struct({
    position: vec2f,
    velocity: vec2f,
  }),
  triangleAmount,
);
type TrianglePosData = typeof trianglePosData;

const trianglePosBuffers = Array.from({ length: 2 }, () => {
  return wgsl.buffer(trianglePosData).$allowUniform().$allowMutable();
});

const pairs = [
  [trianglePosBuffers[0].asUniform(), trianglePosBuffers[1].asMutable()],
  [trianglePosBuffers[1].asUniform(), trianglePosBuffers[0].asMutable()],
];

const readSlot = tgpu.slot<TgpuBufferUniform<TrianglePosData>>();
const writeSlot = tgpu.slot<TgpuBufferMutable<TrianglePosData>>();

function randomizeTriangles() {
  const positions = [];
  for (let i = 0; i < triangleAmount; i++) {
    const position = [Math.random() * 2 - 1, Math.random() * 2 - 1] as [number, number];
    const velocity = [Math.random() * 0.01 - 0.005, Math.random() * 0.01 - 0.005] as [
      number,
      number,
    ];
    positions.push({ position, velocity });
  }
  runtime.writeBuffer(trianglePosBuffers[0], positions);
  runtime.writeBuffer(trianglePosBuffers[1], positions);
}

const rotate = wgsl.fn`(v: vec2f, angle: f32) -> vec2f {
  let pos = vec2(
    (v.x * cos(angle)) - (v.y * sin(angle)),
    (v.x * sin(angle)) + (v.y * cos(angle))
  );
  return pos;
}`;

const getRotationFromVelocity = wgsl.fn`(velocity: vec2f) -> f32 {
  return -atan2(velocity.x, velocity.y);
}`;

const renderPipelines = [0, 1].map((idx) =>
  runtime.makeRenderPipeline({
    vertex: {
      code: wgsl`
      let instanceInfo = ${pairs[idx][0]}[${builtin.instanceIndex}];
      let rotated = ${rotate}(
        ${triangleVertex.asVertex()},
        ${getRotationFromVelocity}(instanceInfo.velocity),
      );

      let offset = instanceInfo.position;

      let pos = vec4f(rotated + offset, 0.0, 1.0);
      let fragUV = (rotated + vec2f(${triangleSize}, ${triangleSize})) / vec2f(${triangleSize} * 2.0);
    `,
      output: {
        [builtin.position]: 'pos',
        fragUV: vec2f,
      },
    },
    fragment: {
      code: wgsl`
      let color1 = vec3(196.0 / 255.0, 100.0 / 255.0, 255.0 / 255.0);
      let color2 = vec3(29.0 / 255.0, 114.0 / 255.0, 240.0 / 255.0);

      let dist = length(fragUV - vec2(0.5, 0.5));

      let color = mix(color1, color2, dist);

      return vec4(color, 1.0);
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
  }),
);

const computePipelines = [0, 1].map((idx) =>
  runtime.makeComputePipeline({
    code: wgsl`
    let index = ${builtin.globalInvocationId}.x;
    var instanceInfo = ${readSlot}[index];
    let triangleSize = ${triangleSize};

    if (instanceInfo.position[0] > 1.0 + triangleSize) {
      instanceInfo.position[0] = -1.0 - triangleSize;
    }
    if (instanceInfo.position[1] > 1.0 + triangleSize) {
      instanceInfo.position[1] = -1.0 - triangleSize;
    }
    if (instanceInfo.position[0] < -1.0 - triangleSize) {
      instanceInfo.position[0] = 1.0 + triangleSize;
    }
    if (instanceInfo.position[1] < -1.0 - triangleSize) {
      instanceInfo.position[1] = 1.0 + triangleSize;
    }

    instanceInfo.position += instanceInfo.velocity;

    ${writeSlot}[index] = instanceInfo;
  `
      .with(readSlot, pairs[idx][0])
      .with(writeSlot, pairs[idx][1]),
  }),
);

randomizeTriangles();
let even = false;
onFrame(() => {
  even = !even;
  computePipelines[even ? 0 : 1].execute({
    workgroups: [triangleAmount],
  });
  renderPipelines[even ? 1 : 0].execute({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    vertexCount: 3,
    instanceCount: triangleAmount,
  });

  runtime.flush();
});
