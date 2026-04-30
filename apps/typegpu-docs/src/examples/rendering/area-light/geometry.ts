import type { common, d } from 'typegpu';
import type { Lights, Vertex } from './schemas.ts';

type Vec2 = [number, number];
type Vec3 = [number, number, number];

interface Material {
  albedo: Vec3;
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

const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v: Vec3, by: number): Vec3 => [v[0] * by, v[1] * by, v[2] * by];

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 0 ? scale(v, 1 / length) : v3(0, 1, 0);
}

function material(albedo: Vec3, roughness: number, metallic = 0, wetness = 0): Material {
  return { albedo, roughness, metallic, wetness };
}

const materials = {
  floor: material(v3(0.026, 0.022, 0.026), 0.1, 0, 1),
  backdrop: material(v3(0.026, 0.019, 0.028), 0.42),
  plinth: material(v3(0.052, 0.04, 0.046), 0.14),
  block: material(v3(0.03, 0.024, 0.032), 0.18),
  gold: material(v3(1, 0.62, 0.18), 0.18, 0.55),
  ceramic: material(v3(0.2, 0.17, 0.17), 0.16),
  plastic: material(v3(0.045, 0.028, 0.075), 0.16),
} satisfies Record<string, Material>;

export const initialLights = [
  {
    center: v3(0, 3.05, -0.55),
    dirX: v3(1, 0, 0),
    dirY: v3(0, 0, 1),
    halfSize: [1.25, 0.75] satisfies Vec2,
    color: v3(1, 0.26, 0.62),
    intensity: 8.2,
  },
  {
    center: v3(-3.4, 1.6, 1.8),
    dirX: v3(0, 0, 1),
    dirY: v3(0, 1, 0),
    halfSize: [0.7, 0.95] satisfies Vec2,
    color: v3(1, 0.48, 0.16),
    intensity: 4.4,
  },
  {
    center: v3(3.1, 1.45, -2.5),
    dirX: v3(1, 0, 0),
    dirY: v3(0, 1, 0),
    halfSize: [0.55, 0.8] satisfies Vec2,
    color: v3(0.56, 0.24, 1),
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

  function vertex(position: Vec3, normal: Vec3, mat: Material) {
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
  center: Vec3,
  axisU: Vec3,
  axisV: Vec3,
  normal: Vec3,
  mat: Material,
) {
  const p0 = sub(sub(center, axisU), axisV);
  const p1 = sub(add(center, axisU), axisV);
  const p2 = add(add(center, axisU), axisV);
  const p3 = add(sub(center, axisU), axisV);

  mesh.vertex(p0, normal, mat);
  mesh.vertex(p1, normal, mat);
  mesh.vertex(p2, normal, mat);
  mesh.vertex(p0, normal, mat);
  mesh.vertex(p2, normal, mat);
  mesh.vertex(p3, normal, mat);
}

function pushBox(mesh: MeshWriter, center: Vec3, halfExtents: Vec3, mat: Material) {
  const [x, y, z] = center;
  const [hx, hy, hz] = halfExtents;
  const face = (offset: Vec3, axisU: Vec3, axisV: Vec3, normal: Vec3) =>
    pushQuad(mesh, v3(x + offset[0], y + offset[1], z + offset[2]), axisU, axisV, normal, mat);

  face(v3(0, hy, 0), v3(hx, 0, 0), v3(0, 0, -hz), v3(0, 1, 0));
  face(v3(0, -hy, 0), v3(hx, 0, 0), v3(0, 0, hz), v3(0, -1, 0));
  face(v3(0, 0, hz), v3(hx, 0, 0), v3(0, hy, 0), v3(0, 0, 1));
  face(v3(0, 0, -hz), v3(hx, 0, 0), v3(0, hy, 0), v3(0, 0, -1));
  face(v3(-hx, 0, 0), v3(0, 0, hz), v3(0, hy, 0), v3(-1, 0, 0));
  face(v3(hx, 0, 0), v3(0, 0, hz), v3(0, hy, 0), v3(1, 0, 0));
}

function spherePoint(center: Vec3, radius: number, u: number, v: number): [Vec3, Vec3] {
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  const normal = normalize(
    v3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)),
  );

  return [add(center, scale(normal, radius)), normal];
}

function pushSphere(mesh: MeshWriter, center: Vec3, radius: number, mat: Material) {
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
      mesh.vertex(b, bn, mat);
      mesh.vertex(c, cn, mat);
      mesh.vertex(a, an, mat);
      mesh.vertex(c, cn, mat);
      mesh.vertex(d, dn, mat);
    }
  }
}

export function createSceneMesh(): SceneMesh {
  const mesh = createMeshWriter(SCENE_VERTEX_COUNT);

  pushQuad(mesh, v3(0, 0, 0), v3(5.8, 0, 0), v3(0, 0, -4.9), v3(0, 1, 0), materials.floor);
  pushQuad(mesh, v3(0, 1.3, -3.3), v3(4.2, 0, 0), v3(0, 1.3, 0), v3(0, 0, 1), materials.backdrop);

  pushBox(mesh, v3(0, 0.08, -0.7), v3(2.55, 0.08, 1.25), materials.plinth);
  pushBox(mesh, v3(-2.55, 0.22, 0.9), v3(0.55, 0.22, 0.55), materials.block);
  pushBox(mesh, v3(2.25, 0.14, 0.75), v3(0.65, 0.14, 0.45), materials.plinth);

  pushSphere(mesh, v3(-1.25, 0.88, -1.1), 0.72, materials.gold);
  pushSphere(mesh, v3(0.3, 0.54, 0.35), 0.38, materials.ceramic);
  pushSphere(mesh, v3(1.25, 0.72, -0.45), 0.56, materials.plastic);
  pushSphere(mesh, v3(-2.55, 0.92, 0.9), 0.48, materials.plastic);

  return { vertexCount: mesh.vertexCount, data: mesh.data };
}
