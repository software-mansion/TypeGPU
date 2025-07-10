import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();

// constants
const TRIANGLE_SIZE = 0.03;

// data structures
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

const TriangleDataArray = (n: number) => d.arrayOf(TriangleData, n);

// layouts and buffers
const renderBindGroupLayout = tgpu.bindGroupLayout({
  colorPalette: { uniform: d.vec3f },
});

const computeBindGroupLayout = tgpu.bindGroupLayout({
  currentTrianglePos: { storage: TriangleDataArray },
  nextTrianglePos: {
    storage: TriangleDataArray,
    access: 'mutable',
  },
});

const { colorPalette } = renderBindGroupLayout.bound;
const { currentTrianglePos, nextTrianglePos } = computeBindGroupLayout.bound;

const paramsBuffer = root
  .createBuffer(Params)
  .$usage('uniform');
const params = paramsBuffer.as('uniform');

// helper functions
const rotate = tgpu.fn([d.vec2f, d.f32], d.vec2f)((v, angle) => {
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec2f(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
}).$name('rotate util');

const getRotationFromVelocity = tgpu.fn([d.vec2f], d.f32)(
  (velocity) => -std.atan2(velocity.x, velocity.y),
).$name('get rotation from velocity util');

// entry functions
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
}).$name('vertex shader');

const mainFrag = tgpu['~unstable']
  .fragmentFn({
    in: VertexOutput,
    out: d.vec4f,
  })((input) => input.color)
  .$name('fragment shader');

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

  if (instanceInfo.position.x > 1.0 + TRIANGLE_SIZE) {
    instanceInfo.position.x = -1.0 - TRIANGLE_SIZE;
  }
  if (instanceInfo.position.y > 1.0 + TRIANGLE_SIZE) {
    instanceInfo.position.y = -1.0 - TRIANGLE_SIZE;
  }
  if (instanceInfo.position.x < -1.0 - TRIANGLE_SIZE) {
    instanceInfo.position.x = 1.0 + TRIANGLE_SIZE;
  }
  if (instanceInfo.position.y < -1.0 - TRIANGLE_SIZE) {
    instanceInfo.position.y = 1.0 + TRIANGLE_SIZE;
  }

  instanceInfo.position = std.add(instanceInfo.position, instanceInfo.velocity);

  nextTrianglePos.value[index] = instanceInfo;
}).$name('compute shader');

// WGSL resolution
const resolved = tgpu.resolve({
  externals: { mainVert, mainFrag, mainCompute },
});

(document.querySelector('.wgsl') as HTMLDivElement).innerText = resolved;

export function onCleanup() {
  root.destroy();
}
