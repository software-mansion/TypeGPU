import { d, std, type common } from 'typegpu';
import type { Lights, Vertex } from './schemas.ts';

interface Material {
  albedo: d.v3f;
  roughness: number;
  metallic: number;
  wetness: number;
}

export interface SceneMesh {
  vertexCount: number;
  data: common.writeSoA.InputFor<typeof Vertex.propTypes>;
}

const SPHERE_SEGMENTS = 48;
const SPHERE_RINGS = 24;
const QUAD_VERTICES = 6;
const BOX_VERTICES = QUAD_VERTICES * 6;
const SPHERE_VERTICES = SPHERE_SEGMENTS * SPHERE_RINGS * QUAD_VERTICES;
const SCENE_VERTEX_COUNT = QUAD_VERTICES * 2 + BOX_VERTICES * 3 + SPHERE_VERTICES * 4;

function material(albedo: d.v3f, roughness: number, metallic = 0, wetness = 0): Material {
  return { albedo, roughness, metallic, wetness };
}

const materials = {
  floor: material(d.vec3f(0.026, 0.022, 0.026), 0.1, 0, 1),
  backdrop: material(d.vec3f(0.026, 0.019, 0.028), 0.42),
  plinth: material(d.vec3f(0.052, 0.04, 0.046), 0.14),
  block: material(d.vec3f(0.03, 0.024, 0.032), 0.18),
  gold: material(d.vec3f(1, 0.62, 0.18), 0.18, 0.55),
  ceramic: material(d.vec3f(0.2, 0.17, 0.17), 0.16),
  plastic: material(d.vec3f(0.045, 0.028, 0.075), 0.16),
} satisfies Record<string, Material>;

export const initialLights = [
  {
    center: d.vec3f(0, 3.05, -0.55),
    dirX: d.vec3f(1, 0, 0),
    dirY: d.vec3f(0, 0, 1),
    halfSize: d.vec2f(1.25, 0.75),
    color: d.vec3f(1, 0.26, 0.62),
    intensity: 8.2,
  },
  {
    center: d.vec3f(-3.4, 1.6, 1.8),
    dirX: d.vec3f(0, 0, 1),
    dirY: d.vec3f(0, 1, 0),
    halfSize: d.vec2f(0.7, 0.95),
    color: d.vec3f(1, 0.48, 0.16),
    intensity: 4.4,
  },
  {
    center: d.vec3f(3.1, 1.45, -2.5),
    dirX: d.vec3f(1, 0, 0),
    dirY: d.vec3f(0, 1, 0),
    halfSize: d.vec2f(0.55, 0.8),
    color: d.vec3f(0.56, 0.24, 1),
    intensity: 2.6,
  },
] satisfies d.InferInput<typeof Lights>;

function createMeshWriter(vertexCount: number) {
  const data = {
    position: new Float32Array(vertexCount * 3),
    normal: new Float32Array(vertexCount * 3),
    albedo: new Float32Array(vertexCount * 3),
    roughness: new Float32Array(vertexCount),
    metallic: new Float32Array(vertexCount),
    wetness: new Float32Array(vertexCount),
  } satisfies SceneMesh['data'];

  let cursor = 0;

  function vertex(position: d.v3f, normal: d.v3f, mat: Material) {
    const vecOffset = cursor * 3;
    data.position.set(position, vecOffset);
    data.normal.set(normal, vecOffset);
    data.albedo.set(mat.albedo, vecOffset);
    data.roughness[cursor] = mat.roughness;
    data.metallic[cursor] = mat.metallic;
    data.wetness[cursor] = mat.wetness;
    cursor++;
  }

  return {
    data,
    get vertexCount() {
      return cursor;
    },
    vertex,
  };
}

type MeshWriter = ReturnType<typeof createMeshWriter>;

function pushQuad(
  mesh: MeshWriter,
  center: d.v3f,
  axisU: d.v3f,
  axisV: d.v3f,
  normal: d.v3f,
  mat: Material,
) {
  const p0 = center.sub(axisU).sub(axisV);
  const p1 = center.add(axisU).sub(axisV);
  const p2 = center.add(axisU).add(axisV);
  const p3 = center.sub(axisU).add(axisV);

  mesh.vertex(p0, normal, mat);
  mesh.vertex(p1, normal, mat);
  mesh.vertex(p2, normal, mat);
  mesh.vertex(p0, normal, mat);
  mesh.vertex(p2, normal, mat);
  mesh.vertex(p3, normal, mat);
}

function pushBox(mesh: MeshWriter, center: d.v3f, halfExtents: d.v3f, mat: Material) {
  const [hx, hy, hz] = halfExtents;
  const face = (offset: d.v3f, axisU: d.v3f, axisV: d.v3f, normal: d.v3f) =>
    pushQuad(mesh, center.add(offset), axisU, axisV, normal, mat);

  face(d.vec3f(0, hy, 0), d.vec3f(hx, 0, 0), d.vec3f(0, 0, -hz), d.vec3f(0, 1, 0));
  face(d.vec3f(0, -hy, 0), d.vec3f(hx, 0, 0), d.vec3f(0, 0, hz), d.vec3f(0, -1, 0));
  face(d.vec3f(0, 0, hz), d.vec3f(hx, 0, 0), d.vec3f(0, hy, 0), d.vec3f(0, 0, 1));
  face(d.vec3f(0, 0, -hz), d.vec3f(hx, 0, 0), d.vec3f(0, hy, 0), d.vec3f(0, 0, -1));
  face(d.vec3f(-hx, 0, 0), d.vec3f(0, 0, hz), d.vec3f(0, hy, 0), d.vec3f(-1, 0, 0));
  face(d.vec3f(hx, 0, 0), d.vec3f(0, 0, hz), d.vec3f(0, hy, 0), d.vec3f(1, 0, 0));
}

function spherePoint(center: d.v3f, radius: number, u: number, v: number): [d.v3f, d.v3f] {
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  const normal = std.normalize(
    d.vec3f(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)),
  );

  return [center.add(normal.mul(radius)), normal];
}

function pushSphere(mesh: MeshWriter, center: d.v3f, radius: number, mat: Material) {
  for (let y = 0; y < SPHERE_RINGS; y++) {
    const v0 = y / SPHERE_RINGS;
    const v1 = (y + 1) / SPHERE_RINGS;

    for (let x = 0; x < SPHERE_SEGMENTS; x++) {
      const u0 = x / SPHERE_SEGMENTS;
      const u1 = (x + 1) / SPHERE_SEGMENTS;
      const [a, an] = spherePoint(center, radius, u0, v0);
      const [b, bn] = spherePoint(center, radius, u0, v1);
      const [c, cn] = spherePoint(center, radius, u1, v1);
      const [d, dn] = spherePoint(center, radius, u1, v0);

      mesh.vertex(a, an, mat);
      mesh.vertex(c, cn, mat);
      mesh.vertex(b, bn, mat);
      mesh.vertex(a, an, mat);
      mesh.vertex(d, dn, mat);
      mesh.vertex(c, cn, mat);
    }
  }
}

export function createSceneMesh(): SceneMesh {
  const mesh = createMeshWriter(SCENE_VERTEX_COUNT);

  pushQuad(
    mesh,
    d.vec3f(0, 0, 0),
    d.vec3f(5.8, 0, 0),
    d.vec3f(0, 0, -4.9),
    d.vec3f(0, 1, 0),
    materials.floor,
  );
  pushQuad(
    mesh,
    d.vec3f(0, 1.3, -3.3),
    d.vec3f(4.2, 0, 0),
    d.vec3f(0, 1.3, 0),
    d.vec3f(0, 0, 1),
    materials.backdrop,
  );

  pushBox(mesh, d.vec3f(0, 0.08, -0.7), d.vec3f(2.55, 0.08, 1.25), materials.plinth);
  pushBox(mesh, d.vec3f(-2.55, 0.22, 0.9), d.vec3f(0.55, 0.22, 0.55), materials.block);
  pushBox(mesh, d.vec3f(2.25, 0.14, 0.75), d.vec3f(0.65, 0.14, 0.45), materials.plinth);

  pushSphere(mesh, d.vec3f(-1.25, 0.88, -1.1), 0.72, materials.gold);
  pushSphere(mesh, d.vec3f(0.3, 0.54, 0.35), 0.38, materials.ceramic);
  pushSphere(mesh, d.vec3f(1.25, 0.72, -0.45), 0.56, materials.plastic);
  pushSphere(mesh, d.vec3f(-2.55, 0.92, 0.9), 0.48, materials.plastic);

  return { vertexCount: mesh.vertexCount, data: mesh.data };
}
