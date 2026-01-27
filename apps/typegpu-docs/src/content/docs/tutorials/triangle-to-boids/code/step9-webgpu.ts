// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN
import {
  addButtonParameter,
  addElement,
  addSliderParameter,
  onFrame,
} from '@typegpu/example-toolkit';

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();

if (!device) {
  throw new Error('Failed to acquire a device');
}

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

addButtonParameter('Randomize', randomizeTriangles);

const parametersBuffer = device.createBuffer({
  size: 6 * 4,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  mappedAtCreation: true,
});
new Float32Array(parametersBuffer.getMappedRange()).set([
  0.09,
  0.005,
  0.3,
  0.005,
  0.3,
  0.001,
]);
parametersBuffer.unmap();

const triangleSize = 0.04;
const triangleVertexData = new Float32Array([
  0.0,
  triangleSize,
  -triangleSize / 2,
  -triangleSize / 2,
  triangleSize / 2,
  -triangleSize / 2,
]);

const triangleAmount = 500;
const trianglePosBuffers = Array.from({ length: 2 }, () =>
  device.createBuffer({
    size: triangleAmount * 8 * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_DST,
  }));

const triangleVertexBuffer = device.createBuffer({
  size: triangleVertexData.byteLength,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
new Float32Array(triangleVertexBuffer.getMappedRange()).set(triangleVertexData);
triangleVertexBuffer.unmap();

function randomizeTriangles() {
  if (!device) {
    return;
  }
  const data = new Float32Array(triangleAmount * 4);
  for (let i = 0; i < triangleAmount; i++) {
    data[i * 4] = Math.random() * 2 - 1;
    data[i * 4 + 1] = Math.random() * 2 - 1;
    data[i * 4 + 2] = Math.random() * 0.1 - 0.05;
    data[i * 4 + 3] = Math.random() * 0.1 - 0.05;
  }
  device.queue.writeBuffer(trianglePosBuffers[0], 0, data.buffer);
  device.queue.writeBuffer(trianglePosBuffers[1], 0, data.buffer);
}

const wgslCode = `
  fn rotate(v: vec2f, angle: f32) -> vec2f {
    let pos = vec2(
      (v.x * cos(angle)) - (v.y * sin(angle)),
      (v.x * sin(angle)) + (v.y * cos(angle))
    );
    return pos;
  };

  fn getRotationFromVelocity(velocity: vec2f) -> f32 {
    return -atan2(velocity.x, velocity.y);
  };

  struct TriangleData {
    position : vec2f,
    velocity : vec2f,
  };

  struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(1) fragUV : vec2f,
  };

  @binding(0) @group(0) var<uniform> trianglePos : array<TriangleData, ${triangleAmount}>;

  @vertex
  fn mainVert(@builtin(instance_index) ii: u32 ,@location(0) v: vec2f) -> VertexOutput {
    let instanceInfo = trianglePos[ii];

    let rotated = rotate(v, getRotationFromVelocity(instanceInfo.velocity));
    let offset = instanceInfo.position;

    let pos = vec4(rotated + offset, 0.0, 1.0);
    let fragUV = (rotated + vec2f(${triangleSize}, ${triangleSize})) / vec2f(${triangleSize} * 2.0);
    return VertexOutput(pos, fragUV);
  }

  @fragment
  fn mainFrag(@location(1) fragUV : vec2f) -> @location(0) vec4f {
    let color1 = vec3(196.0 / 255.0, 100.0 / 255.0, 255.0 / 255.0);
    let color2 = vec3(29.0 / 255.0, 114.0 / 255.0, 240.0 / 255.0);

    let dist = length(fragUV - vec2(0.5, 0.5));

    let color = mix(color1, color2, dist);

    return vec4(color, 1.0);
  }
`;

const wgslCodeCompute = `
  struct TriangleData {
    position : vec2f,
    velocity : vec2f,
  };

  struct Parameters {
    separation_distance : f32,
    separation_strength : f32,
    alignment_distance : f32,
    alignment_strength : f32,
    cohesion_distance : f32,
    cohesion_strength : f32,
  };

  @binding(0) @group(0) var<uniform> currentTrianglePos : array<TriangleData, ${triangleAmount}>;
  @binding(1) @group(0) var<storage, read_write> nextTrianglePos : array<TriangleData>;
  @binding(2) @group(0) var<storage> params : Parameters;

  @compute @workgroup_size(1)
  fn mainCompute(@builtin(global_invocation_id) gid: vec3u) {
    let index = gid.x;
    var instanceInfo = currentTrianglePos[index];

    var separation = vec2(0.0, 0.0);
    var alignment = vec2(0.0, 0.0);
    var alignmentCount = 0u;
    var cohesion = vec2(0.0, 0.0);
    var cohesionCount = 0u;
    for (var i = 0u; i < ${triangleAmount}; i = i + 1) {
      if (i == index) {
        continue;
      }
      var other = currentTrianglePos[i];
      var dist = distance(instanceInfo.position, other.position);
      if (dist < params.separation_distance) {
        separation += instanceInfo.position - other.position;
      }
      if (dist < params.alignment_distance) {
        alignment += other.velocity;
        alignmentCount++;
      }
      if (dist < params.cohesion_distance) {
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

    instanceInfo.velocity += (separation * params.separation_strength) + (alignment * params.alignment_strength) + (cohesion * params.cohesion_strength);
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

    nextTrianglePos[index] = instanceInfo;
  }
`;

const module = device.createShaderModule({
  code: wgslCode,
});
const moduleCompute = device.createShaderModule({
  code: wgslCodeCompute,
});

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: module,
    buffers: [
      {
        arrayStride: 2 * 4,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2',
          },
        ],
      },
    ],
  },
  fragment: {
    module: module,
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

const computePipeline = device.createComputePipeline({
  layout: 'auto',
  compute: {
    module: moduleCompute,
  },
});

const renderBindGroups = [0, 1].map((idx) =>
  device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: trianglePosBuffers[idx],
        },
      },
    ],
  })
);

const computeBindGroups = [0, 1].map((idx) =>
  device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: trianglePosBuffers[idx],
        },
      },
      {
        binding: 1,
        resource: {
          buffer: trianglePosBuffers[1 - idx],
        },
      },
      {
        binding: 2,
        resource: {
          buffer: parametersBuffer,
        },
      },
    ],
  })
);

randomizeTriangles();
let even = false;
onFrame(() => {
  even = !even;
  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(
    0,
    even ? computeBindGroups[0] : computeBindGroups[1],
  );
  computePass.dispatchWorkgroups(triangleAmount);
  computePass.end();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setVertexBuffer(0, triangleVertexBuffer);
  passEncoder.setBindGroup(0, even ? renderBindGroups[1] : renderBindGroups[0]);
  passEncoder.draw(3, triangleAmount);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
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
  if (!device) {
    return;
  }
  const data = new Float32Array(Object.values(options));
  device.queue.writeBuffer(parametersBuffer, 0, data);
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
