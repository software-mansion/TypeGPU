// The boids example, written against @typegpu/prune
import { tgpu, d, std } from 'typegpu';
import { init, precompile } from '@typegpu/prune';
import { getRotationFromVelocity, rotate, TriangleData } from './shared.ts';

const triangleAmount = 1000;
const triangleSize = 0.03;
const defaultParams = {
  separationDistance: 0.05,
  separationStrength: 0.001,
  alignmentDistance: 0.3,
  alignmentStrength: 0.01,
  cohesionDistance: 0.3,
  cohesionStrength: 0.001,
};

const boids = precompile((root) => {
  const Params = d.struct({
    separationDistance: d.f32,
    separationStrength: d.f32,
    alignmentDistance: d.f32,
    alignmentStrength: d.f32,
    cohesionDistance: d.f32,
    cohesionStrength: d.f32,
  });

  const colorPalette = root.createUniform(d.vec3f);

  const VertexOutput = { position: d.builtin.position, color: d.vec4f };

  const mainVert = tgpu.vertexFn({
    in: { v: d.vec2f, center: d.vec2f, velocity: d.vec2f },
    out: VertexOutput,
  })((input) => {
    'use gpu';
    const angle = getRotationFromVelocity(input.velocity);
    const rotated = rotate(input.v, angle);
    const pos = d.vec4f(rotated + input.center, 0, 1);
    const color = d.vec4f(std.sin(colorPalette.$ + angle) * 0.45 + 0.45, 1);
    return { position: pos, color };
  });

  const mainFrag = tgpu.fragmentFn({ in: VertexOutput, out: d.vec4f })((input) => input.color);

  const paramsBuffer = root.createBuffer(Params, defaultParams).$usage('uniform');
  const params = paramsBuffer.as('uniform');

  const triangleVertexBuffer = root
    .createBuffer(d.arrayOf(d.vec2f, 3), [
      d.vec2f(0.0, triangleSize),
      d.vec2f(-triangleSize / 2, -triangleSize / 2),
      d.vec2f(triangleSize / 2, -triangleSize / 2),
    ])
    .$usage('vertex');

  const TriangleDataArray = d.arrayOf(TriangleData);
  const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));
  const instanceLayout = tgpu.vertexLayout(TriangleDataArray, 'instance');

  // No format given, so the preferred canvas format is used, even in pruned builds
  const renderPipeline = root
    .createRenderPipeline({
      attribs: {
        v: vertexLayout.attrib,
        center: instanceLayout.attrib.position,
        velocity: instanceLayout.attrib.velocity,
      },
      vertex: mainVert,
      fragment: mainFrag,
    })
    .with(vertexLayout, triangleVertexBuffer);

  const layout = tgpu.bindGroupLayout({
    currentTrianglePos: { storage: TriangleDataArray },
    nextTrianglePos: { storage: TriangleDataArray, access: 'mutable' },
  });

  const simulate = (index: number) => {
    'use gpu';
    const self = TriangleData(layout.$.currentTrianglePos[index] as d.Infer<typeof TriangleData>);
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

    const velocity =
      params.$.separationStrength * separation +
      params.$.alignmentStrength * alignment +
      params.$.cohesionStrength * cohesion;

    self.velocity += velocity;
    self.velocity = std.clamp(std.length(self.velocity), 0, 0.01) * std.normalize(self.velocity);
    self.position += self.velocity;

    const domain = (1 + triangleSize) * 2;
    self.position = (std.fract(self.position / domain + 0.5) - 0.5) * domain;

    layout.$.nextTrianglePos[index] = TriangleData(self);
  };

  return {
    Positions: d.arrayOf(TriangleData, triangleAmount),
    paramsBuffer,
    colorPalette,
    layout,
    instanceLayout,
    simulatePipeline: root.createGuardedComputePipeline(simulate),
    renderPipeline,
  };
});

// --- runtime code, the same in dev and in pruned builds

const root = await init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const gpu = boids(root);

const createPositionsBuffer = () =>
  root.createBuffer(gpu.Positions).$usage('storage', 'uniform', 'vertex');
const trianglePosBuffers = [createPositionsBuffer(), createPositionsBuffer()] as const;

const randomizePositions = () => {
  const positions = Array.from({ length: triangleAmount }, () => ({
    position: [Math.random() * 2 - 1, Math.random() * 2 - 1],
    velocity: [Math.random() * 0.1 - 0.05, Math.random() * 0.1 - 0.05],
  }));
  // oxlint-disable-next-line typescript/no-explicit-any -- plain arrays work for vectors in both modes
  trianglePosBuffers[0].write(positions as any);
  // oxlint-disable-next-line typescript/no-explicit-any -- plain arrays work for vectors in both modes
  trianglePosBuffers[1].write(positions as any);
};
randomizePositions();

const computeBindGroups = [
  root.createBindGroup(gpu.layout, {
    currentTrianglePos: trianglePosBuffers[0],
    nextTrianglePos: trianglePosBuffers[1],
  }),
  root.createBindGroup(gpu.layout, {
    currentTrianglePos: trianglePosBuffers[1],
    nextTrianglePos: trianglePosBuffers[0],
  }),
] as const;

let even = false;

function frame() {
  even = !even;

  gpu.simulatePipeline.with(computeBindGroups[even ? 0 : 1]).dispatchThreads(triangleAmount);

  gpu.renderPipeline
    .withColorAttachment({ view: context, clearValue: [1, 1, 1, 1] })
    .with(gpu.instanceLayout, trianglePosBuffers[even ? 1 : 0])
    .draw(3, triangleAmount);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
