// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN

import {
  addButtonParameter,
  addElement,
  addSliderParameter,
  onFrame,
} from '@typegpu/example-toolkit';
import {
  builtin,
  createRuntime,
  type TgpuBufferMutable,
  type TgpuBufferUniform,
  wgsl,
} from 'typegpu';
import { arrayOf, f32, struct, vec2f } from 'typegpu/data';

const runtime = await createRuntime();

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

addButtonParameter('Randomize', randomizeTriangles);

const parametesBuffer = wgsl
  .buffer(
    struct({
      separationDistance: f32,
      separationStrength: f32,
      alignmentDistance: f32,
      alignmentStrength: f32,
      cohesionDistance: f32,
      cohesionStrength: f32,
    }),
    {
      separationDistance: 0.03,
      separationStrength: 0.001,
      alignmentDistance: 0.3,
      alignmentStrength: 0.01,
      cohesionDistance: 0.3,
      cohesionStrength: 0.001,
    },
  )
  .$allowReadonly();

const triangleSize = 0.04;
const triangleVertex = wgsl
  .buffer(arrayOf(vec2f, 3), [
    [0.0, triangleSize],
    [-triangleSize / 2, -triangleSize / 2],
    [triangleSize / 2, -triangleSize / 2],
  ])
  .$allowVertex('vertex');

const triangleAmount = 500;
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
    const position = [Math.random() * 2 - 1, Math.random() * 2 - 1] as [
      number,
      number,
    ];
    const velocity = [
      Math.random() * 0.1 - 0.05,
      Math.random() * 0.1 - 0.05,
    ] as [number, number];
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
  })
);

const computePipelines = [0, 1].map((idx) =>
  runtime.makeComputePipeline({
    code: wgsl`
    let index = ${builtin.globalInvocationId}.x;
    var instanceInfo = ${readSlot}[index];
    let params = ${parametesBuffer.asReadonly()};

    var separation = vec2(0.0, 0.0);
    var alignment = vec2(0.0, 0.0);
    var alignmentCount = 0u;
    var cohesion = vec2(0.0, 0.0);
    var cohesionCount = 0u;
    for (var i = 0u; i < ${triangleAmount}; i = i + 1) {
      if (i == index) {
        continue;
      }
      var other = ${readSlot}[i];
      var dist = distance(instanceInfo.position, other.position);
      if (dist < params.separationDistance) {
        separation += instanceInfo.position - other.position;
      }
      if (dist < params.alignmentDistance) {
        alignment += other.velocity;
        alignmentCount++;
      }
      if (dist < params.cohesionDistance) {
        cohesion += other.position;
        cohesionCount++;
      }
    };

    if (alignmentCount > 0u) {
      alignment = alignment / f32(alignmentCount);
    }

    if (cohesionCount > 0u) {
      cohesion = (cohesion / f32(cohesionCount)) - instanceInfo.position;
    }

    instanceInfo.velocity += (separation * params.separationStrength) + (alignment * params.alignmentStrength) + (cohesion * params.cohesionStrength);
    instanceInfo.velocity = normalize(instanceInfo.velocity) * clamp(length(instanceInfo.velocity), 0.0, 0.01);

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
  })
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

const options = {
  separationDistance: 0.05,
  separationStrength: 0.001,
  alignmentDistance: 0.3,
  alignmentStrength: 0.01,
  cohesionDistance: 0.3,
  cohesionStrength: 0.001,
};

function applyOptions() {
  runtime.writeBuffer(parametesBuffer, options);
}

addSliderParameter(
  'Separation Dist',
  options.separationDistance,
  {
    min: 0.0,
    max: 0.5,
    step: 0.001,
  },
  (v) => {
    options.separationDistance = v;
    applyOptions();
  },
);

addSliderParameter(
  'Separation Str',
  options.separationStrength,
  {
    min: 0.0,
    max: 0.1,
    step: 0.001,
  },
  (v) => {
    options.separationStrength = v;
    applyOptions();
  },
);

addSliderParameter(
  'Align Dist',
  options.alignmentDistance,
  {
    min: 0.0,
    max: 0.5,
    step: 0.001,
  },
  (v) => {
    options.alignmentDistance = v;
    applyOptions();
  },
);

addSliderParameter(
  'Align Str',
  options.alignmentStrength,
  {
    min: 0.0,
    max: 0.1,
    step: 0.001,
  },
  (v) => {
    options.alignmentStrength = v;
    applyOptions();
  },
);

addSliderParameter(
  'Cohesion Dist',
  options.cohesionDistance,
  {
    min: 0.0,
    max: 0.5,
    step: 0.001,
  },
  (v) => {
    options.cohesionDistance = v;
    applyOptions();
  },
);

addSliderParameter(
  'Cohesion Str',
  options.cohesionStrength,
  {
    min: 0.0,
    max: 0.1,
    step: 0.001,
  },
  (v) => {
    options.cohesionStrength = v;
    applyOptions();
  },
);
