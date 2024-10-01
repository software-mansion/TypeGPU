/*
{
  "title": "Boids",
  "category": "simulation",
  "tags": ["experimental"]
}
*/

import { arrayOf, f32, struct, vec2f, vec3f } from 'typegpu/data';
import tgpu from 'typegpu/experimental';

const triangleAmount = 1000;
const triangleSize = 0.03;

const renderCode = /* wgsl */ `
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
    @location(1) color : vec4f,
  };

  @binding(0) @group(0) var<uniform> trianglePos : array<TriangleData, ${triangleAmount}>;
  @binding(1) @group(0) var<uniform> colorPalette : vec3f;

  @vertex
  fn mainVert(@builtin(instance_index) ii: u32, @location(0) v: vec2f) -> VertexOutput {
    let instanceInfo = trianglePos[ii];

    let angle = getRotationFromVelocity(instanceInfo.velocity);
    let rotated = rotate(v, angle);

    let offset = instanceInfo.position;
    let pos = vec4(rotated + offset, 0.0, 1.0);

    let color = vec4(
        sin(angle + colorPalette.r) * 0.45 + 0.45,
        sin(angle + colorPalette.g) * 0.45 + 0.45,
        sin(angle + colorPalette.b) * 0.45 + 0.45,
        1.0);

    return VertexOutput(pos, color);
  }

  @fragment
  fn mainFrag(@location(1) color : vec4f) -> @location(0) vec4f {
    return color;
  }
`;

const computeCode = /* wgsl */ `
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
  @binding(1) @group(0) var<storage, read_write> nextTrianglePos : array<TriangleData, ${triangleAmount}>;
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
    instanceInfo.velocity +=
      (separation * params.separation_strength)
      + (alignment * params.alignment_strength)
      + (cohesion * params.cohesion_strength);
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

type BoidsOptions = {
  separationDistance: number;
  separationStrength: number;
  alignmentDistance: number;
  alignmentStrength: number;
  cohesionDistance: number;
  cohesionStrength: number;
};

const colorPresets = {
  plumTree: vec3f(1.0, 2.0, 1.0),
  jeans: vec3f(2.0, 1.5, 1.0),
  greyscale: vec3f(0, 0, 0),
  hotcold: vec3f(0, 3.14, 3.14),
};
type ColorPresets = keyof typeof colorPresets;

const presets = {
  default: {
    separationDistance: 0.05,
    separationStrength: 0.001,
    alignmentDistance: 0.3,
    alignmentStrength: 0.01,
    cohesionDistance: 0.3,
    cohesionStrength: 0.001,
  },
  mosquitoes: {
    separationDistance: 0.02,
    separationStrength: 0.01,
    alignmentDistance: 0.0,
    alignmentStrength: 0.0,
    cohesionDistance: 0.177,
    cohesionStrength: 0.011,
  },
  blobs: {
    separationDistance: 0.033,
    separationStrength: 0.051,
    alignmentDistance: 0.047,
    alignmentStrength: 0.1,
    cohesionDistance: 0.3,
    cohesionStrength: 0.013,
  },
  particles: {
    separationDistance: 0.035,
    separationStrength: 1,
    alignmentDistance: 0.0,
    alignmentStrength: 0.0,
    cohesionDistance: 0.0,
    cohesionStrength: 0.0,
  },
  nanites: {
    separationDistance: 0.067,
    separationStrength: 0.01,
    alignmentDistance: 0.066,
    alignmentStrength: 0.021,
    cohesionDistance: 0.086,
    cohesionStrength: 0.094,
  },
} as const;

if (!navigator.gpu) {
  throw new Error('WebGPU is not supported by this browser.');
}
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('Could not find a compatible GPU.');
}
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const Params = struct({
  separationDistance: f32,
  separationStrength: f32,
  alignmentDistance: f32,
  alignmentStrength: f32,
  cohesionDistance: f32,
  cohesionStrength: f32,
});

const paramsBuffer = root
  .createBuffer(Params, presets.default)
  .$usage(tgpu.Storage);

const triangleVertexBuffer = root
  .createBuffer(arrayOf(f32, 6), [
    0.0,
    triangleSize,
    -triangleSize / 2,
    -triangleSize / 2,
    triangleSize / 2,
    -triangleSize / 2,
  ])
  .$usage(tgpu.Vertex);

const TriangleInfoStruct = struct({
  position: vec2f,
  velocity: vec2f,
});

const trianglePosBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(arrayOf(TriangleInfoStruct, triangleAmount))
    .$usage(tgpu.Storage, tgpu.Uniform),
);

const randomizePositions = () => {
  const positions = Array.from({ length: triangleAmount }, () => ({
    position: vec2f(Math.random() * 2 - 1, Math.random() * 2 - 1),
    velocity: vec2f(Math.random() * 0.1 - 0.05, Math.random() * 0.1 - 0.05),
  }));
  trianglePosBuffers[0].write(positions);
  trianglePosBuffers[1].write(positions);
};
randomizePositions();

const colorPaletteBuffer = root
  .createBuffer(vec3f, colorPresets.jeans)
  .$usage(tgpu.Uniform);

const updateColorPreset = (newColorPreset: ColorPresets) => {
  colorPaletteBuffer.write(colorPresets[newColorPreset]);
};

const updateParams = (newOptions: BoidsOptions) => {
  paramsBuffer.write(newOptions);
};

const renderModule = root.device.createShaderModule({
  code: renderCode,
});

const computeModule = root.device.createShaderModule({
  code: computeCode,
});

const pipeline = root.device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: renderModule,
    buffers: [
      {
        arrayStride: 2 * 4,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2' as const,
          },
        ],
      },
    ],
  },
  fragment: {
    module: renderModule,
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

const computePipeline = root.device.createComputePipeline({
  layout: 'auto',
  compute: {
    module: computeModule,
  },
});

const renderBindGroupLayout = tgpu.bindGroupLayout({
  trianglePos: { uniform: arrayOf(TriangleInfoStruct, triangleAmount) },
  colorPalette: { uniform: vec3f },
});

const renderBindGroups = [0, 1].map((idx) =>
  renderBindGroupLayout.populate({
    trianglePos: trianglePosBuffers[idx],
    colorPalette: colorPaletteBuffer,
  }),
);

const computeBindGroupLayout = tgpu.bindGroupLayout({
  currentTrianglePos: { uniform: arrayOf(TriangleInfoStruct, triangleAmount) },
  nextTrianglePos: {
    storage: arrayOf(TriangleInfoStruct, triangleAmount),
    access: 'mutable',
  },
  params: { storage: Params },
});

const computeBindGroups = [0, 1].map((idx) =>
  computeBindGroupLayout.populate({
    currentTrianglePos: trianglePosBuffers[idx],
    nextTrianglePos: trianglePosBuffers[1 - idx],
    params: paramsBuffer,
  }),
);

const renderPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined as unknown as GPUTextureView,
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    },
  ],
};

let even = false;
function frame() {
  even = !even;
  (
    renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachment]
  )[0].view = context.getCurrentTexture().createView();

  const commandEncoder = root.device.createCommandEncoder();
  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(
    0,
    even
      ? root.unwrap(computeBindGroups[0])
      : root.unwrap(computeBindGroups[1]),
  );
  computePass.dispatchWorkgroups(triangleAmount);
  computePass.end();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setVertexBuffer(0, triangleVertexBuffer.buffer);
  passEncoder.setBindGroup(
    0,
    even ? root.unwrap(renderBindGroups[1]) : root.unwrap(renderBindGroups[0]),
  );
  passEncoder.draw(3, triangleAmount);
  passEncoder.end();

  root.device.queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(frame);
}

frame();

/** @button "Randomize" */
export function randomize() {
  randomizePositions();
}

/** @button "🐦 Birds" */
export function choosePresetDefault() {
  updateParams(presets.default);
}

/** @button "🦟 Mosquitoes" */
export function choosePresetMosquitos() {
  updateParams(presets.mosquitoes);
}

/** @button "💧 Blobs" */
export function choosePresetBlobs() {
  updateParams(presets.blobs);
}

/** @button "⚛ Particles" */
export function choosePresetParticles() {
  updateParams(presets.particles);
}

/** @button "🤖 Nanites" */
export function choosePresetNanites() {
  updateParams(presets.nanites);
}

/** @button "🟪🟩" */
export function setColorPresetPlumTree() {
  updateColorPreset('plumTree');
}

/** @button "🟦🟫" */
export function setColorPresetJeans() {
  updateColorPreset('jeans');
}

/** @button "⬛⬜" */
export function setColorPresetGreyscale() {
  updateColorPreset('greyscale');
}

/** @button "🟥🟦" */
export function setColorPresetHotcold() {
  updateColorPreset('hotcold');
}
