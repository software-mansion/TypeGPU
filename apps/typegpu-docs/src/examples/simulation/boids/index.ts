import tgpu, { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const triangleAmount = 1000;
const triangleSize = 0.03;

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

const colorPresets = {
  plumTree: d.vec3f(1.0, 2.0, 1.0),
  jeans: d.vec3f(2.0, 1.5, 1.0),
  greyscale: d.vec3f(0, 0, 0),
  hotcold: d.vec3f(0, 3.14, 3.14),
};

const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec2f(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
};

const getRotationFromVelocity = (velocity: d.v2f) => {
  'use gpu';
  return -std.atan2(velocity.x, velocity.y);
};

type Params = d.Infer<typeof Params>;
const Params = d.struct({
  separationDistance: d.f32,
  separationStrength: d.f32,
  alignmentDistance: d.f32,
  alignmentStrength: d.f32,
  cohesionDistance: d.f32,
  cohesionStrength: d.f32,
});

const TriangleData = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

const root = await tgpu.init();

const colorPalette = root.createUniform(d.vec3f);

const VertexOutput = {
  position: d.builtin.position,
  color: d.vec4f,
};

const mainVert = tgpu.vertexFn({
  in: { v: d.vec2f, center: d.vec2f, velocity: d.vec2f },
  out: VertexOutput,
})((input) => {
  'use gpu';
  const angle = getRotationFromVelocity(input.velocity);
  const rotated = rotate(input.v, angle);
  const pos = d.vec4f(rotated + input.center, 0, 1);

  const color = d.vec4f(
    std.sin(colorPalette.$ + angle) * 0.45 + 0.45,
    1,
  );

  return { position: pos, color };
});

const mainFrag = tgpu.fragmentFn({
  in: VertexOutput,
  out: d.vec4f,
})((input) => input.color);

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

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

const TriangleDataArray = d.arrayOf(TriangleData);

const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));
const instanceLayout = tgpu.vertexLayout(TriangleDataArray, 'instance');

const renderPipeline = root
  .createRenderPipeline({
    attribs: {
      v: vertexLayout.attrib,
      center: instanceLayout.attrib.position,
      velocity: instanceLayout.attrib.velocity,
    },
    vertex: mainVert,
    fragment: mainFrag,
    targets: { format: presentationFormat },
  })
  .with(vertexLayout, triangleVertexBuffer);

const layout = tgpu.bindGroupLayout({
  currentTrianglePos: { storage: TriangleDataArray },
  nextTrianglePos: {
    storage: TriangleDataArray,
    access: 'mutable',
  },
});

const simulate = (index: number) => {
  'use gpu';
  const self = TriangleData(layout.$.currentTrianglePos[index]);
  let separation = d.vec2f();
  let alignment = d.vec2f();
  let cohesion = d.vec2f();
  let alignmentCount = 0;
  let cohesionCount = 0;

  for (const other of layout.$.currentTrianglePos) {
    const dist = std.distance(self.position, other.position);
    if (dist < params.$.separationDistance) {
      separation += self.position - other.position;
    }
    if (dist < params.$.alignmentDistance) {
      alignment += other.velocity;
      alignmentCount++;
    }
    if (dist < params.$.cohesionDistance) {
      cohesion += other.position;
      cohesionCount++;
    }
  }
  if (alignmentCount > 0) {
    alignment /= d.f32(alignmentCount);
  }
  if (cohesionCount > 0) {
    cohesion /= d.f32(cohesionCount);
    cohesion -= self.position;
  }

  const velocity = params.$.separationStrength * separation +
    params.$.alignmentStrength * alignment +
    params.$.cohesionStrength * cohesion;

  self.velocity += velocity;
  self.velocity = std.clamp(std.length(self.velocity), 0, 0.01) *
    std.normalize(self.velocity);

  self.position += self.velocity;

  // Wrap the domain
  const domain = (1 + triangleSize) * 2;
  self.position = (std.fract(self.position / domain + 0.5) - 0.5) * domain;

  layout.$.nextTrianglePos[index] = TriangleData(self);
};

const simulatePipeline = root.createGuardedComputePipeline(simulate);

const computeBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(layout, {
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

  simulatePipeline
    .with(computeBindGroups[even ? 0 : 1])
    .dispatchThreads(triangleAmount);

  renderPipeline
    .withColorAttachment({
      view: context,
      clearValue: [1, 1, 1, 1],
    })
    .with(instanceLayout, trianglePosBuffers[even ? 1 : 0])
    .draw(3, triangleAmount);

  requestAnimationFrame(frame);
}

frame();

// #region Example controls and cleanup

export const controls = defineControls({
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
    onButtonClick: () => colorPalette.write(colorPresets.plumTree),
  },

  '🟦🟫': {
    onButtonClick: () => colorPalette.write(colorPresets.jeans),
  },

  '⬛⬜': {
    onButtonClick: () => colorPalette.write(colorPresets.greyscale),
  },

  '🟥🟦': {
    onButtonClick: () => colorPalette.write(colorPresets.hotcold),
  },
});

export function onCleanup() {
  disposed = true;
  root.destroy();
}

// #endregion
