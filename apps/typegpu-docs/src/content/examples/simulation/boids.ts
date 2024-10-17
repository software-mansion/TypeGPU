/*
{
  "title": "Boids (experimental)",
  "category": "simulation",
  "tags": ["experimental"]
}
*/

import {
  addButtonParameter,
  addElement,
  addSliderParameter,
  addSliderPlumParameter,
  onFrame,
} from '@typegpu/example-toolkit';
import { arrayOf, f32, struct, u32, vec2f } from 'typegpu/data';
import tgpu, {
  type TgpuBufferUsage,
  asMutable,
  asReadonly,
  asUniform,
  asVertex,
  builtin,
  wgsl,
} from 'typegpu/experimental';

const root = await tgpu.init();

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

addButtonParameter('randomize', randomizeTriangles);

const parametersBuffer = root
  .createBuffer(
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
  .$usage('storage');

const triangleSize = addSliderPlumParameter('triangle size', 0.04, {
  min: 0.01,
  max: 0.1,
  step: 0.01,
});
const triangleSizeBuffer = root
  .createBuffer(f32, triangleSize)
  .$usage('uniform');
const triangleSizePlum = wgsl.plum((get) => {
  const size = get(triangleSize);
  return [
    vec2f(0.0, size),
    vec2f(-size / 2, -size / 2),
    vec2f(size / 2, -size / 2),
  ];
});

const triangleVertex = root
  .createBuffer(arrayOf(vec2f, 3), triangleSizePlum)
  .$usage('vertex');

const MAX_TRIANGLES = 10000;
const triangleAmount = addSliderPlumParameter('triangle amount', 500, {
  min: 1,
  max: 10000,
  step: 1,
});
const triangleAmountBuffer = root
  .createBuffer(u32, triangleAmount)
  .$usage('uniform');
const trianglePosData = arrayOf(
  struct({
    position: vec2f,
    velocity: vec2f,
  }),
  MAX_TRIANGLES,
);
type TrianglePosData = typeof trianglePosData;

const trianglePosBuffers = Array.from({ length: 2 }, () => {
  return root.createBuffer(trianglePosData).$usage('storage');
});

const bufferPairs = [
  [asReadonly(trianglePosBuffers[0]), asMutable(trianglePosBuffers[1])],
  [asReadonly(trianglePosBuffers[1]), asMutable(trianglePosBuffers[0])],
];

const readSlot = wgsl.slot<TgpuBufferUsage<TrianglePosData, 'readonly'>>();
const writeSlot = wgsl.slot<TgpuBufferUsage<TrianglePosData, 'mutable'>>();

function randomizeTriangles() {
  const positions = [];
  for (let i = 0; i < MAX_TRIANGLES; i++) {
    const position = vec2f(Math.random() * 2 - 1, Math.random() * 2 - 1);
    const velocity = vec2f(
      Math.random() * 0.1 - 0.05,
      Math.random() * 0.1 - 0.05,
    );
    positions.push({ position, velocity });
  }

  trianglePosBuffers[0].write(positions);
  trianglePosBuffers[1].write(positions);
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
  root.makeRenderPipeline({
    vertex: {
      code: wgsl`
        let triangleSize = ${asUniform(triangleSizeBuffer)};
        let instanceInfo = ${bufferPairs[idx][0]}[${builtin.instanceIndex}];
        let rotated = ${rotate}(
          ${asVertex(triangleVertex, 'vertex')},
          ${getRotationFromVelocity}(instanceInfo.velocity),
        );

        let offset = instanceInfo.position;

        let pos = vec4f(rotated + offset, 0.0, 1.0);
        let fragUV = (rotated + vec2f(triangleSize, triangleSize)) / vec2f(triangleSize * 2.0);
      `,
      output: {
        [builtin.position.s]: 'pos',
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
  root.makeComputePipeline({
    code: wgsl`
      let triangleSize = ${asUniform(triangleSizeBuffer)};
      let index = ${builtin.globalInvocationId}.x;
      var instanceInfo = ${readSlot}[index];
      let params = ${asReadonly(parametersBuffer)};

      var separation = vec2(0.0, 0.0);
      var alignment = vec2(0.0, 0.0);
      var alignmentCount = 0u;
      var cohesion = vec2(0.0, 0.0);
      var cohesionCount = 0u;
      for (var i = 0u; i < ${asUniform(triangleAmountBuffer)}; i = i + 1) {
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
      .with(readSlot, bufferPairs[idx][0])
      .with(writeSlot, bufferPairs[idx][1]),
  }),
);

randomizeTriangles();
let even = false;
onFrame(() => {
  even = !even;
  computePipelines[even ? 0 : 1].execute({
    workgroups: [root.readPlum(triangleAmount)],
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
    instanceCount: root.readPlum(triangleAmount),
  });

  root.flush();
});

const parameters = {
  separationDistance: 0.05,
  separationStrength: 0.001,
  alignmentDistance: 0.3,
  alignmentStrength: 0.01,
  cohesionDistance: 0.3,
  cohesionStrength: 0.001,
};

function applyOptions() {
  parametersBuffer.write(parameters);
}

addSliderParameter(
  'separation dist',
  parameters.separationDistance,
  {
    min: 0.0,
    max: 0.5,
    step: 0.001,
  },
  (v) => {
    parameters.separationDistance = v;
    applyOptions();
  },
);

addSliderParameter(
  'separation str',
  parameters.separationStrength,
  {
    min: 0.0,
    max: 0.1,
    step: 0.001,
  },
  (v) => {
    parameters.separationStrength = v;
    applyOptions();
  },
);

addSliderParameter(
  'align dist',
  parameters.alignmentDistance,
  {
    min: 0.0,
    max: 0.5,
    step: 0.001,
  },
  (v) => {
    parameters.alignmentDistance = v;
    applyOptions();
  },
);

addSliderParameter(
  'align str',
  parameters.alignmentStrength,
  {
    min: 0.0,
    max: 0.1,
    step: 0.001,
  },
  (v) => {
    parameters.alignmentStrength = v;
    applyOptions();
  },
);

addSliderParameter(
  'cohesion dist',
  parameters.cohesionDistance,
  {
    min: 0.0,
    max: 0.5,
    step: 0.001,
  },
  (v) => {
    parameters.cohesionDistance = v;
    applyOptions();
  },
);

addSliderParameter(
  'cohesion str',
  parameters.cohesionStrength,
  {
    min: 0.0,
    max: 0.1,
    step: 0.001,
  },
  (v) => {
    parameters.cohesionStrength = v;
    applyOptions();
  },
);
