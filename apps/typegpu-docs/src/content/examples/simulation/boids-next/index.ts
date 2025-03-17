import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const triangleAmount = 1000;
const triangleSize = 0.03;

const rotate = tgpu['~unstable'].fn([d.vec2f, d.f32], d.vec2f).does(/* wgsl */ `
  (v: vec2f, angle: f32) -> vec2f {
    let pos = vec2(
      (v.x * cos(angle)) - (v.y * sin(angle)),
      (v.x * sin(angle)) + (v.y * cos(angle))
    );

    return pos;
  }
`);

const getRotationFromVelocity = tgpu['~unstable']
  .fn([d.vec2f], d.f32)
  .does(/* wgsl */ `
  (velocity: vec2f) -> f32 {
    return -atan2(velocity.x, velocity.y);
  }
`);

const TriangleData = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

const renderBindGroupLayout = tgpu.bindGroupLayout({
  trianglePos: { uniform: d.arrayOf(TriangleData, triangleAmount) },
  colorPalette: { uniform: d.vec3f },
});

const { trianglePos, colorPalette } = renderBindGroupLayout.bound;

const VertexOutput = {
  position: d.builtin.position,
  color: d.vec4f,
};

const mainVert = tgpu['~unstable']
  .vertexFn({
    in: { v: d.vec2f, center: d.vec2f, velocity: d.vec2f },
    out: VertexOutput,
  })
  .does(/* wgsl */ `(input: VertexInput) -> VertexOutput {
    let angle = getRotationFromVelocity(input.velocity);
    let rotated = rotate(input.v, angle);

    let pos = vec4(rotated + input.center, 0.0, 1.0);

    let color = vec4(
        sin(angle + colorPalette.r) * 0.45 + 0.45,
        sin(angle + colorPalette.g) * 0.45 + 0.45,
        sin(angle + colorPalette.b) * 0.45 + 0.45,
        1.0);

    return VertexOutput(pos, color);
  }`)
  .$uses({
    trianglePos,
    colorPalette,
    getRotationFromVelocity,
    rotate,
  });

const mainFrag = tgpu['~unstable']
  .fragmentFn({ in: VertexOutput, out: d.vec4f })
  .does(/* wgsl */ `
  (input: FragmentInput) -> @location(0) vec4f {
    return input.color;
  }
`);

const Params = d
  .struct({
    separationDistance: d.f32,
    separationStrength: d.f32,
    alignmentDistance: d.f32,
    alignmentStrength: d.f32,
    cohesionDistance: d.f32,
    cohesionStrength: d.f32,
  })
  .$name('Params');

type Params = d.Infer<typeof Params>;

const colorPresets = {
  plumTree: d.vec3f(1.0, 2.0, 1.0),
  jeans: d.vec3f(2.0, 1.5, 1.0),
  greyscale: d.vec3f(0, 0, 0),
  hotcold: d.vec3f(0, 3.14, 3.14),
};

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

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const paramsBuffer = root
  .createBuffer(Params, presets.default)
  .$usage('uniform');
const params = paramsBuffer.as('uniform');

const triangleVertexBuffer = root
  .createBuffer(d.arrayOf(d.vec2f, 3), [
    d.vec2f(0.0, triangleSize),
    d.vec2f(-triangleSize / 2, -triangleSize / 2),
    d.vec2f(triangleSize / 2, -triangleSize / 2),
  ])
  .$usage('vertex');

const trianglePosBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(d.arrayOf(TriangleData, triangleAmount))
    .$usage('storage', 'uniform', 'vertex'),
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

const TriangleDataArray = (n: number) => d.arrayOf(TriangleData, n);

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(d.vec2f, n));
const instanceLayout = tgpu.vertexLayout(TriangleDataArray, 'instance');

const renderPipeline = root['~unstable']
  .withVertex(mainVert, {
    v: vertexLayout.attrib,
    center: instanceLayout.attrib.position,
    velocity: instanceLayout.attrib.velocity,
  })
  .withFragment(mainFrag, {
    format: presentationFormat,
  })
  .createPipeline()
  .with(vertexLayout, triangleVertexBuffer);

const computeBindGroupLayout = tgpu
  .bindGroupLayout({
    currentTrianglePos: { storage: TriangleDataArray },
    nextTrianglePos: {
      storage: TriangleDataArray,
      access: 'mutable',
    },
  })
  .$name('compute');

const { currentTrianglePos, nextTrianglePos } = computeBindGroupLayout.bound;

const mainCompute = tgpu['~unstable']
  .computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [1] })
  .does(/* wgsl */ `(input: ComputeInput) {
    let index = input.gid.x;
    var instanceInfo = currentTrianglePos[index];
    var separation = vec2f();
    var alignment = vec2f();
    var cohesion = vec2f();
    var alignmentCount = 0u;
    var cohesionCount = 0u;

    for (var i = 0u; i < arrayLength(&currentTrianglePos); i += 1) {
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
  }`)
  .$uses({ currentTrianglePos, nextTrianglePos, params, triangleSize });

const computePipeline = root['~unstable']
  .withCompute(mainCompute)
  .createPipeline();

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
  }),
);

let even = false;
let disposed = false;

function frame() {
  if (disposed) {
    return;
  }

  even = !even;

  computePipeline
    .with(computeBindGroupLayout, computeBindGroups[even ? 0 : 1])
    .dispatchWorkgroups(triangleAmount);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    })
    .with(instanceLayout, trianglePosBuffers[even ? 1 : 0])
    .with(renderBindGroupLayout, renderBindGroups[even ? 1 : 0])
    .draw(3, triangleAmount);

  requestAnimationFrame(frame);
}

frame();

// #region Example controls and cleanup

export const controls = {
  Randomize: {
    onButtonClick: () => randomizePositions(),
  },

  '🐦 Birds': {
    onButtonClick: () => paramsBuffer.write(presets.default),
  },

  '🦟 Mosquitoes': {
    onButtonClick: () => paramsBuffer.write(presets.mosquitoes),
  },

  '💧 Blobs': {
    onButtonClick: () => paramsBuffer.write(presets.blobs),
  },

  '⚛ Particles': {
    onButtonClick: () => paramsBuffer.write(presets.particles),
  },

  '🤖 Nanites': {
    onButtonClick: () => paramsBuffer.write(presets.nanites),
  },

  '🟪🟩': {
    onButtonClick: () => colorPaletteBuffer.write(colorPresets.plumTree),
  },

  '🟦🟫': {
    onButtonClick: () => colorPaletteBuffer.write(colorPresets.jeans),
  },

  '⬛⬜': {
    onButtonClick: () => colorPaletteBuffer.write(colorPresets.greyscale),
  },

  '🟥🟦': {
    onButtonClick: () => colorPaletteBuffer.write(colorPresets.hotcold),
  },
};

export function onCleanup() {
  disposed = true;
  root.destroy();
}

// #endregion
