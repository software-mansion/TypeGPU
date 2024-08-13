/*
{
  "title": "Temp3",
  "category": "image-processing"
}
*/

import { addButton, addElement, onFrame } from '@typegpu/example-toolkit';
import { type WgslBufferUsage, builtin, createRuntime, wgsl } from 'typegpu';
import { arrayOf, f32, struct, vec2f } from 'typegpu/data';

const runtime = await createRuntime();
const device = runtime.device;

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

addButton('Randomize', randomizeTriangles);

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
    x: f32,
    y: f32,
    rotation: f32,
  }),
  triangleAmount,
);
type TrianglePosData = typeof trianglePosData;

const trianglePosBuffers = Array.from({ length: 2 }, () => {
  return wgsl
    .buffer(trianglePosData)
    .$allowReadonlyStorage()
    .$allowMutableStorage();
});

const pairs = [
  [
    trianglePosBuffers[0].asReadonlyStorage(),
    trianglePosBuffers[1].asMutableStorage(),
  ],
  [
    trianglePosBuffers[1].asReadonlyStorage(),
    trianglePosBuffers[0].asMutableStorage(),
  ],
] as [
  WgslBufferUsage<TrianglePosData, 'readonly_storage'>,
  WgslBufferUsage<TrianglePosData, 'mutable_storage'>,
][];

const readSlot =
  wgsl.slot<WgslBufferUsage<TrianglePosData, 'readonly_storage'>>();
const writeSlot =
  wgsl.slot<WgslBufferUsage<TrianglePosData, 'mutable_storage'>>();

function randomizeTriangles() {
  const positions = [];
  for (let i = 0; i < triangleAmount; i++) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const rotation = Math.random() * Math.PI * 2;
    positions.push({ x, y, rotation });
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

const renderPipelines = [0, 1].map((idx) =>
  runtime.makeRenderPipeline({
    vertex: {
      code: wgsl`
      let instanceInfo = ${pairs[idx][0]}[${builtin.instanceIndex}];
      let rotated = ${rotate}(
        ${triangleVertex.asVertex()},
        instanceInfo.rotation
      );

      let offset = vec2f(
        instanceInfo.x,
        instanceInfo.y
      );

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

    if (instanceInfo.x > 1.0 + triangleSize) {
      instanceInfo.x = -1.0 - triangleSize;
    }
    if (instanceInfo.y > 1.0 + triangleSize) {
      instanceInfo.y = -1.0 - triangleSize;
    }

    instanceInfo.rotation += 0.01;
    instanceInfo.x += 0.01;
    instanceInfo.y += 0.01;

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
