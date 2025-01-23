import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const triangleAmount = 1000;
const triangleSize = 0.03;

const utilityFunctions = /* wgsl */ `
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
`;

const renderCode = /* wgsl */ `
  struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(1) color : vec4f,
  };

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
    instanceInfo.velocity +=
      (separation * params.separationStrength)
      + (alignment * params.alignmentStrength)
      + (cohesion * params.cohesionStrength);
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
  plumTree: d.vec3f(1.0, 2.0, 1.0),
  jeans: d.vec3f(2.0, 1.5, 1.0),
  greyscale: d.vec3f(0, 0, 0),
  hotcold: d.vec3f(0, 3.14, 3.14),
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

const Params = d.struct({
  separationDistance: d.f32,
  separationStrength: d.f32,
  alignmentDistance: d.f32,
  alignmentStrength: d.f32,
  cohesionDistance: d.f32,
  cohesionStrength: d.f32,
});

const paramsBuffer = root
  .createBuffer(Params, presets.default)
  .$usage('storage');

const triangleVertexBuffer = root
  .createBuffer(d.arrayOf(d.vec2f, 3), [
    d.vec2f(0.0, triangleSize),
    d.vec2f(-triangleSize / 2, -triangleSize / 2),
    d.vec2f(triangleSize / 2, -triangleSize / 2),
  ])
  .$usage('vertex');

const TriangleInfoStruct = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

const trianglePosBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(d.arrayOf(TriangleInfoStruct, triangleAmount))
    .$usage('storage', 'uniform'),
);

const randomizePositions = () => {
  const positions = Array.from({ length: triangleAmount }, () => ({
    position: d.vec2f(Math.random() * 2 - 1, Math.random() * 2 - 1),
    velocity: d.vec2f(Math.random() * 0.1 - 0.05, Math.random() * 0.1 - 0.05),
  }));
  trianglePosBuffers[0].write(positions);
  trianglePosBuffers[1].write(positions);
};
randomizePositions();

const colorPaletteBuffer = root
  .createBuffer(d.vec3f, colorPresets.jeans)
  .$usage('uniform');

const updateColorPreset = (newColorPreset: ColorPresets) => {
  colorPaletteBuffer.write(colorPresets[newColorPreset]);
};

const updateParams = (newOptions: BoidsOptions) => {
  paramsBuffer.write(newOptions);
};

const renderBindGroupLayout = tgpu.bindGroupLayout({
  trianglePos: { uniform: d.arrayOf(TriangleInfoStruct, triangleAmount) },
  colorPalette: { uniform: d.vec3f },
});

const computeBindGroupLayout = tgpu.bindGroupLayout({
  currentTrianglePos: {
    uniform: d.arrayOf(TriangleInfoStruct, triangleAmount),
  },
  nextTrianglePos: {
    storage: d.arrayOf(TriangleInfoStruct, triangleAmount),
    access: 'mutable',
  },
  params: { storage: Params },
});

const renderModule = root.device.createShaderModule({
  code: tgpu.resolve({
    template: renderCode.concat(utilityFunctions),
    externals: {
      ...renderBindGroupLayout.bound,
    },
  }),
});

const computeModule = root.device.createShaderModule({
  code: tgpu.resolve({
    template: computeCode,
    externals: {
      ...computeBindGroupLayout.bound,
    },
  }),
});

const vertexLayout = tgpu['~unstable'].vertexLayout((n) =>
  d.arrayOf(d.location(0, d.vec2f), n),
);

console.log(root.unwrap(vertexLayout));

const pipeline = root.device.createRenderPipeline({
  layout: root.device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(renderBindGroupLayout)],
  }),
  vertex: {
    module: renderModule,
    buffers: [root.unwrap(vertexLayout)],
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
  layout: root.device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(computeBindGroupLayout)],
  }),
  compute: {
    module: computeModule,
  },
});

const renderBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(renderBindGroupLayout, {
    trianglePos: trianglePosBuffers[idx],
    colorPalette: colorPaletteBuffer,
  }),
);

const computeBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(computeBindGroupLayout, {
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
let disposed = false;

function frame() {
  if (disposed) {
    return;
  }

  even = !even;
  (
    renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachment]
  )[0].view = context.getCurrentTexture().createView();

  const commandEncoder = root.device.createCommandEncoder();
  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, root.unwrap(computeBindGroups[even ? 0 : 1]));
  computePass.dispatchWorkgroups(triangleAmount);
  computePass.end();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setVertexBuffer(0, triangleVertexBuffer.buffer);
  passEncoder.setBindGroup(0, root.unwrap(renderBindGroups[even ? 1 : 0]));
  passEncoder.draw(3, triangleAmount);
  passEncoder.end();

  root.device.queue.submit([commandEncoder.finish()]);

  requestAnimationFrame(frame);
}

frame();

// #region Example controls and cleanup

export const controls = {
  Randomize: {
    onButtonClick: () => randomizePositions(),
  },

  '🐦 Birds': {
    onButtonClick: () => updateParams(presets.default),
  },

  '🦟 Mosquitoes': {
    onButtonClick: () => updateParams(presets.mosquitoes),
  },

  '💧 Blobs': {
    onButtonClick: () => updateParams(presets.blobs),
  },

  '⚛ Particles': {
    onButtonClick: () => updateParams(presets.particles),
  },

  '🤖 Nanites': {
    onButtonClick: () => updateParams(presets.nanites),
  },

  '🟪🟩': {
    onButtonClick: () => updateColorPreset('plumTree'),
  },

  '🟦🟫': {
    onButtonClick: () => updateColorPreset('jeans'),
  },

  '⬛⬜': {
    onButtonClick: () => updateColorPreset('greyscale'),
  },

  '🟥🟦': {
    onButtonClick: () => updateColorPreset('hotcold'),
  },
};

export function onCleanup() {
  disposed = true;
  root.destroy();
}

// #endregion
