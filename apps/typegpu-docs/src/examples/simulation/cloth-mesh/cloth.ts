import { d, std, tgpu } from 'typegpu';
import { meshes } from '@typegpu/geometry';
import { Camera } from '../../common/setup-orbit-camera.ts';

export const segments = 32;
export const timeStep = 1 / 720;

const stride = segments + 1;
const size = 2.4;
const hangingWidth = 2;
const spacing = size / segments;

export const sheet = meshes.parametric(
  {
    at: (u, v) => {
      'use gpu';
      return d.vec3f((u - 0.5) * hangingWidth, (0.5 - v) * size, 0.08 * std.sin(u * 8 * Math.PI));
    },
  },
  { cols: segments, rows: segments },
);

export const Pointer = d.struct({ position: d.vec2f, radius: d.vec2f });
export const Params = d.struct({ time: d.f32, wind: d.f32, stiffness: d.f32 });
export const Grab = d.struct({
  index: d.i32,
  depth: d.f32,
  offset: d.vec3f,
  candidate: d.atomic(d.u32),
});
export const Vertices = d.arrayOf(meshes.Surface, sheet.vertexCount);
export const Velocities = d.arrayOf(d.vec3f, sheet.vertexCount);
export const Forces = d.arrayOf(d.vec3f, sheet.vertexCount);

export const verticesAccess = tgpu.mutableAccessor(Vertices);
export const velocityAccess = tgpu.mutableAccessor(Velocities);
export const forceAccess = tgpu.mutableAccessor(Forces);
export const grabAccess = tgpu.mutableAccessor(Grab);
export const cameraAccess = tgpu.accessor(Camera);
export const pointerAccess = tgpu.accessor(Pointer);
export const paramsAccess = tgpu.accessor(Params);

const noCandidate = 0xffffffff;
const indexBits = 12;
const indexMask = (1 << indexBits) - 1;
const depthScale = (1 << (32 - indexBits)) - 1;

export const released = { index: -1, depth: 0, offset: d.vec3f(), candidate: noCandidate };

const neighbors = tgpu.const(d.arrayOf(d.vec2i, 12), [
  d.vec2i(-1, 0),
  d.vec2i(1, 0),
  d.vec2i(0, -1),
  d.vec2i(0, 1),

  d.vec2i(-1, -1),
  d.vec2i(1, -1),
  d.vec2i(-1, 1),
  d.vec2i(1, 1),

  d.vec2i(-2, 0),
  d.vec2i(2, 0),
  d.vec2i(0, -2),
  d.vec2i(0, 2),
]);

export function isPinned(index: number) {
  'use gpu';
  return index <= segments && index % 8 === 0;
}

function toClip(position: d.v3f) {
  'use gpu';
  const camera = cameraAccess.$;
  return camera.projection * camera.view * d.vec4f(position, 1);
}

function toWorld(ndc: d.v2f, depth: number) {
  'use gpu';
  const camera = cameraAccess.$;
  const world = camera.viewInverse * camera.projectionInverse * d.vec4f(ndc, depth, 1);
  return world.xyz / world.w;
}

export const pick = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= sheet.vertexCount || isPinned(i)) return;

  const clip = toClip(verticesAccess.$[i].position);
  if (clip.w <= 0) return;

  const ndc = clip.xyz / clip.w;
  const pointer = pointerAccess.$;
  if (std.length((ndc.xy - pointer.position) / pointer.radius) > 1) return;

  const depth = d.u32(std.saturate(ndc.z) * depthScale);
  std.atomicMin(grabAccess.$.candidate, (depth << indexBits) | i);
});

export const resolve = tgpu.computeFn({ workgroupSize: [1] })(() => {
  'use gpu';
  const key = std.atomicLoad(grabAccess.$.candidate);
  std.atomicStore(grabAccess.$.candidate, noCandidate);
  if (key === noCandidate) return;

  const index = d.i32(key & indexMask);
  const position = verticesAccess.$[index].position;
  const clip = toClip(position);
  const depth = clip.z / clip.w;

  grabAccess.$.index = index;
  grabAccess.$.depth = depth;
  grabAccess.$.offset = position - toWorld(pointerAccess.$.position, depth);
});

export const forces = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= sheet.vertexCount) return;

  if (isPinned(i) || d.i32(i) === grabAccess.$.index) {
    forceAccess.$[i] = d.vec3f();
    return;
  }

  const cell = d.vec2i(i % stride, std.intdiv(i, stride));
  const position = verticesAccess.$[i].position;
  const velocity = velocityAccess.$[i];

  const params = paramsAccess.$;
  const gust = params.wind * (6 + 4 * std.sin(params.time * 2 + position.x * 3 + position.y));
  let force =
    d.vec3f(params.wind * std.sin(params.time + position.y) * 2, -9.8, gust) *
    (timeStep * timeStep);

  for (const offset of neighbors.$) {
    const neighbor = cell + offset;
    if (std.any(std.lt(neighbor, d.vec2i())) || std.any(std.gt(neighbor, d.vec2i(segments)))) {
      continue;
    }

    const neighborIndex = neighbor.y * stride + neighbor.x;
    const delta = verticesAccess.$[neighborIndex].position - position;
    const distance = std.max(std.length(delta), 0.000001);
    const direction = delta / distance;
    const restLength = std.length(d.vec2f(offset)) * spacing;

    const bending = std.any(std.eq(std.abs(offset), d.vec2i(2)));
    const stiffness = params.stiffness * (bending ? 0.1 : 0.5);
    const damping = bending ? 0 : 0.06;
    const relativeVelocity = velocityAccess.$[neighborIndex] - velocity;
    const stretchSpeed = std.dot(relativeVelocity, direction);

    force += direction * ((distance - restLength) * stiffness + stretchSpeed * damping);
  }

  forceAccess.$[i] = d.vec3f(force);
});

export const integrate = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= sheet.vertexCount || isPinned(i)) return;

  const vertex = verticesAccess.$[i];
  if (d.i32(i) === grabAccess.$.index) {
    velocityAccess.$[i] = d.vec3f();
    const target = toWorld(pointerAccess.$.position, grabAccess.$.depth) + grabAccess.$.offset;
    const delta = target - vertex.position;
    vertex.position += delta * std.min(1, (8 * timeStep) / std.max(std.length(delta), 0.000001));
  } else {
    velocityAccess.$[i] = velocityAccess.$[i] * 0.995 + forceAccess.$[i];
    vertex.position += velocityAccess.$[i];
  }
});

export const normals = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const i = gid.x;
  if (i >= sheet.vertexCount) return;

  const x = d.i32(i % stride);
  const y = d.i32(std.intdiv(i, stride));

  const left = verticesAccess.$[y * stride + std.max(x - 1, 0)].position;
  const right = verticesAccess.$[y * stride + std.min(x + 1, segments)].position;
  const top = verticesAccess.$[std.max(y - 1, 0) * stride + x].position;
  const bottom = verticesAccess.$[std.min(y + 1, segments) * stride + x].position;

  const normal = std.cross(right - left, bottom - top);
  verticesAccess.$[i].normal = normal / std.max(std.length(normal), 0.000001);
});
