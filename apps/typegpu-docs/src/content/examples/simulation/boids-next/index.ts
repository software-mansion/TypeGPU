import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const triangleAmount = 1000;
const triangleSize = 0.03;

const rotate = tgpu['~unstable'].fn(
  [d.vec2f, d.f32],
  d.vec2f,
)((v, angle) => {
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec2f(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
});

const getRotationFromVelocity = tgpu['~unstable'].fn(
  [d.vec2f],
  d.f32,
)((velocity) => {
  return -std.atan2(velocity.x, velocity.y);
});

const TriangleData = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

const renderBindGroupLayout = tgpu.bindGroupLayout({
  colorPalette: { uniform: d.vec3f },
});

const { colorPalette } = renderBindGroupLayout.bound;

const VertexOutput = {
  position: d.builtin.position,
  color: d.vec4f,
};

const mainVert = tgpu['~unstable'].vertexFn({
  in: { v: d.vec2f, center: d.vec2f, velocity: d.vec2f },
  out: VertexOutput,
})((input) => {
  const angle = getRotationFromVelocity(input.velocity);
  const rotated = rotate(input.v, angle);

  const pos = d.vec4f(
    rotated.x + input.center.x,
    rotated.y + input.center.y,
    0.0,
    1.0,
  );

  const color = d.vec4f(
    std.sin(angle + colorPalette.value.x) * 0.45 + 0.45,
    std.sin(angle + colorPalette.value.y) * 0.45 + 0.45,
    std.sin(angle + colorPalette.value.z) * 0.45 + 0.45,
    1.0,
  );

  return { position: pos, color };
});

const mainFrag = tgpu['~unstable'].fragmentFn({
  in: VertexOutput,
  out: d.vec4f,
})((input) => {
  return input.color;
});

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
    .$usage('storage', 'uniform', 'vertex'));

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

const mainCompute = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
})((input) => {
  const index = input.gid.x;
  const instanceInfo = currentTrianglePos.value[index];
  let separation = d.vec2f();
  let alignment = d.vec2f();
  let cohesion = d.vec2f();
  let alignmentCount = 0;
  let cohesionCount = 0;

  for (let i = d.u32(0); i < currentTrianglePos.value.length; i++) {
    if (i === index) {
      continue;
    }
    const other = currentTrianglePos.value[i];
    const dist = std.distance(instanceInfo.position, other.position);
    if (dist < params.value.separationDistance) {
      separation = std.add(
        separation,
        std.sub(instanceInfo.position, other.position),
      );
    }
    if (dist < params.value.alignmentDistance) {
      alignment = std.add(alignment, other.velocity);
      alignmentCount++;
    }
    if (dist < params.value.cohesionDistance) {
      cohesion = std.add(cohesion, other.position);
      cohesionCount++;
    }
  }
  if (alignmentCount > 0) {
    alignment = std.mul(1.0 / d.f32(alignmentCount), alignment);
  }
  if (cohesionCount > 0) {
    cohesion = std.mul(1.0 / d.f32(cohesionCount), cohesion);
    cohesion = std.sub(cohesion, instanceInfo.position);
  }

  let velocity = std.mul(params.value.separationStrength, separation);
  velocity = std.add(
    velocity,
    std.mul(params.value.alignmentStrength, alignment),
  );
  velocity = std.add(
    velocity,
    std.mul(params.value.cohesionStrength, cohesion),
  );

  instanceInfo.velocity = std.add(instanceInfo.velocity, velocity);
  instanceInfo.velocity = std.mul(
    std.clamp(std.length(instanceInfo.velocity), 0, 0.01),
    std.normalize(instanceInfo.velocity),
  );

  if (instanceInfo.position.x > 1.0 + triangleSize) {
    instanceInfo.position.x = -1.0 - triangleSize;
  }
  if (instanceInfo.position.y > 1.0 + triangleSize) {
    instanceInfo.position.y = -1.0 - triangleSize;
  }
  if (instanceInfo.position.x < -1.0 - triangleSize) {
    instanceInfo.position.x = 1.0 + triangleSize;
  }
  if (instanceInfo.position.y < -1.0 - triangleSize) {
    instanceInfo.position.y = 1.0 + triangleSize;
  }

  instanceInfo.position = std.add(instanceInfo.position, instanceInfo.velocity);

  nextTrianglePos.value[index] = instanceInfo;
});

const computePipeline = root['~unstable']
  .withCompute(mainCompute)
  .createPipeline();

const renderBindGroups = [0, 1].map(() =>
  root.createBindGroup(renderBindGroupLayout, {
    colorPalette: colorPaletteBuffer,
  })
);

const computeBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(computeBindGroupLayout, {
    currentTrianglePos: trianglePosBuffers[idx],
    nextTrianglePos: trianglePosBuffers[1 - idx],
  })
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
