import { d, std, tgpu } from 'typegpu';
import { boxes, spheres } from './scene.ts';
import { type Box, type Material, Vertex, bakeLayout } from './schemas.ts';

const SPHERE_SEGMENTS = 48;
const SPHERE_RINGS = 24;
const BOX_VERTEX_COUNT = 4 * 4 * 6;
const SPHERE_VERTEX_COUNT = SPHERE_SEGMENTS * SPHERE_RINGS * 6;
export const BAKE_WORKGROUP_SIZE = 64;

const QUAD_CORNERS = tgpu.const(d.arrayOf(d.vec2u, 6), [
  d.vec2u(0, 0),
  d.vec2u(1, 0),
  d.vec2u(1, 1),
  d.vec2u(0, 0),
  d.vec2u(1, 1),
  d.vec2u(0, 1),
]);

const RING_SIGNS = tgpu.const(d.arrayOf(d.vec2f, 4), [
  d.vec2f(-1, 1),
  d.vec2f(1, 1),
  d.vec2f(1, -1),
  d.vec2f(-1, -1),
]);

const Station = d.struct({ ySign: d.f32, drop: d.f32, inset: d.f32, spread: d.f32 });

const BOX_PROFILE = tgpu.const(d.arrayOf(Station, 5), [
  { ySign: -1, drop: 0, inset: 0, spread: 0 },
  { ySign: -1, drop: 0, inset: 0, spread: 1 },
  { ySign: 1, drop: 1, inset: 0, spread: 1 },
  { ySign: 1, drop: 0, inset: 1, spread: 1 },
  { ySign: 1, drop: 0, inset: 0, spread: 0 },
]);

function boxPoint(box: d.InferGPU<typeof Box>, station: number, edge: number) {
  'use gpu';
  const s = BOX_PROFILE.$[station];
  const y = box.halfExtents.y * s.ySign - box.bevelHeight * s.drop;
  const xz = (box.halfExtents.xz - box.bevel * s.inset) * s.spread * RING_SIGNS.$[edge % 4];
  return box.center + d.vec3f(xz.x, y, xz.y);
}

function surfaceVertex(position: d.v3f, normal: d.v3f, material: d.InferGPU<typeof Material>) {
  'use gpu';
  return Vertex({
    position,
    normal,
    albedo: material.albedo,
    material: d.vec3f(material.roughness, material.metallic, material.wetness),
  });
}

function boxVertex(i: number) {
  'use gpu';
  const box = boxes.$[std.intdiv(i, BOX_VERTEX_COUNT)];
  const quad = std.intdiv(i % BOX_VERTEX_COUNT, 6);
  const band = std.intdiv(quad, 4);
  const edge = quad % 4;
  const corner = QUAD_CORNERS.$[i % 6];
  const diagonalA = boxPoint(box, band + 1, edge + 1) - boxPoint(box, band, edge);
  const diagonalB = boxPoint(box, band + 1, edge) - boxPoint(box, band, edge + 1);
  return surfaceVertex(
    boxPoint(box, band + corner.y, edge + corner.x),
    std.normalize(std.cross(diagonalA, diagonalB)),
    box.material,
  );
}

function sphereVertex(i: number) {
  'use gpu';
  const sphere = spheres.$[std.intdiv(i, SPHERE_VERTEX_COUNT)];
  const quad = std.intdiv(i % SPHERE_VERTEX_COUNT, 6);
  const corner = QUAD_CORNERS.$[i % 6];
  const theta = ((std.intdiv(quad, SPHERE_SEGMENTS) + corner.y) / SPHERE_RINGS) * Math.PI;
  const phi = (((quad % SPHERE_SEGMENTS) + corner.x) / SPHERE_SEGMENTS) * 2 * Math.PI;
  const normal = d.vec3f(
    std.sin(theta) * std.cos(phi),
    std.cos(theta),
    std.sin(theta) * std.sin(phi),
  );
  return surfaceVertex(sphere.center + normal * sphere.radius, normal, sphere.material);
}

const SHAPES = [
  { count: boxes.$.length * BOX_VERTEX_COUNT, vertexAt: boxVertex },
  { count: spheres.$.length * SPHERE_VERTEX_COUNT, vertexAt: sphereVertex },
];

export const SCENE_VERTICES = SHAPES.reduce((total, s) => total + s.count, 0);

export const bakeScene = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [BAKE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  let i = gid.x;
  for (const s of tgpu.unroll(SHAPES)) {
    if (i < s.count) {
      bakeLayout.$.vertices[gid.x] = s.vertexAt(i);
      return;
    }
    i -= s.count;
  }
});
