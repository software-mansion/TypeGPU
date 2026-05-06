import { d, type common } from 'typegpu';
import type { Lights, Vertex } from './schemas.ts';

interface Material {
  albedo: number[];
  roughness: number;
  metallic: number;
  wetness: number;
}

type SpherePedestal = [
  center: number[],
  halfExtents: number[],
  bevel: number,
  bevelHeight: number,
  sphereRadius: number,
  sphereMaterial: Material,
];

export interface SceneMesh {
  vertexCount: number;
  data: common.writeSoA.InputFor<typeof Vertex.propTypes>;
}

const SPHERE_SEGMENTS = 48;
const SPHERE_RINGS = 24;
const QUAD_VERTICES = 6;
const BEVELED_PEDESTAL_VERTICES = QUAD_VERTICES * 10;
const SPHERE_VERTICES = SPHERE_SEGMENTS * SPHERE_RINGS * QUAD_VERTICES;

function material(albedo: number[], roughness: number, metallic = 0, wetness = 0): Material {
  return { albedo, roughness, metallic, wetness };
}

const materials = {
  floor: material([0.026, 0.022, 0.026], 0.1, 0, 1),
  backdrop: material([0.026, 0.019, 0.028], 0.42),
  plinth: material([0.052, 0.04, 0.046], 0.14),
  gold: material([1, 0.62, 0.18], 0.18, 0.55),
  ceramic: material([0.2, 0.17, 0.17], 0.16),
  plastic: material([0.045, 0.028, 0.075], 0.16),
} satisfies Record<string, Material>;

const spherePedestals = [
  [[-1.15, 0.095, -1.1], [0.88, 0.095, 0.72], 0.13, 0.055, 0.72, materials.gold],
  [[0.05, 0.08, 0.92], [0.44, 0.08, 0.36], 0.08, 0.045, 0.38, materials.ceramic],
  [[1.45, 0.09, -0.62], [0.66, 0.09, 0.52], 0.11, 0.05, 0.56, materials.plastic],
  [[-2.45, 0.16, 0.85], [0.56, 0.16, 0.44], 0.1, 0.055, 0.48, materials.plastic],
] satisfies SpherePedestal[];

const SCENE_VERTEX_COUNT =
  QUAD_VERTICES * 2 + spherePedestals.length * (BEVELED_PEDESTAL_VERTICES + SPHERE_VERTICES);

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

  function vertex(position: number[], normal: number[], mat: Material) {
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
type Quad = [number[], number[], number[], number[]];
type Face = [Quad, number[]];

const QUAD_INDICES = [0, 1, 2, 0, 2, 3] as const;

const add = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v: number[], s: number) => [v[0] * s, v[1] * s, v[2] * s];
const normalize = (v: number[]) => {
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len];
};

const NORMAL_UP = [0, 1, 0];
const NORMAL_DOWN = [0, -1, 0];
const NORMAL_FRONT = [0, 0, 1];
const NORMAL_BACK = [0, 0, -1];
const NORMAL_RIGHT = [1, 0, 0];
const NORMAL_LEFT = [-1, 0, 0];

function pushQuad(
  mesh: MeshWriter,
  center: number[],
  axisU: number[],
  axisV: number[],
  normal: number[],
  mat: Material,
) {
  pushQuadCorners(
    mesh,
    [
      sub(sub(center, axisU), axisV),
      sub(add(center, axisU), axisV),
      add(add(center, axisU), axisV),
      add(sub(center, axisU), axisV),
    ],
    normal,
    mat,
  );
}

function pushQuadCorners(mesh: MeshWriter, corners: Quad, normal: number[], mat: Material) {
  for (const idx of QUAD_INDICES) {
    mesh.vertex(corners[idx], normal, mat);
  }
}

function pushFaces(mesh: MeshWriter, faces: Face[], mat: Material) {
  for (const [corners, normal] of faces) {
    pushQuadCorners(mesh, corners, normal, mat);
  }
}

function pushBeveledPedestal(
  mesh: MeshWriter,
  center: number[],
  halfExtents: number[],
  bevel: number,
  bevelHeight: number,
  mat: Material,
) {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = halfExtents;
  const topY = cy + hy;
  const sideTopY = topY - bevelHeight;
  const bottomY = cy - hy;

  const rect = (y: number, xHalf: number, zHalf: number): Quad => [
    [cx - xHalf, y, cz + zHalf],
    [cx + xHalf, y, cz + zHalf],
    [cx + xHalf, y, cz - zHalf],
    [cx - xHalf, y, cz - zHalf],
  ];

  const bottom = rect(bottomY, hx, hz);
  const side = rect(sideTopY, hx, hz);
  const top = rect(topY, hx - bevel, hz - bevel);
  const slopeNormal = (x: number, z: number) => normalize([x, bevel, z]);

  pushFaces(
    mesh,
    [
      [top, NORMAL_UP],
      [[bottom[0], bottom[3], bottom[2], bottom[1]], NORMAL_DOWN],

      [[bottom[0], bottom[1], side[1], side[0]], NORMAL_FRONT],
      [[bottom[2], bottom[3], side[3], side[2]], NORMAL_BACK],
      [[bottom[1], bottom[2], side[2], side[1]], NORMAL_RIGHT],
      [[bottom[3], bottom[0], side[0], side[3]], NORMAL_LEFT],

      [[side[0], side[1], top[1], top[0]], slopeNormal(0, bevelHeight)],
      [[side[2], side[3], top[3], top[2]], slopeNormal(0, -bevelHeight)],
      [[side[1], side[2], top[2], top[1]], slopeNormal(bevelHeight, 0)],
      [[side[3], side[0], top[0], top[3]], slopeNormal(-bevelHeight, 0)],
    ],
    mat,
  );
}

function spherePoint(center: number[], radius: number, u: number, v: number) {
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  const normal = normalize([
    Math.sin(theta) * Math.cos(phi),
    Math.cos(theta),
    Math.sin(theta) * Math.sin(phi),
  ]);

  return [add(center, scale(normal, radius)), normal];
}

function pushSphere(mesh: MeshWriter, center: number[], radius: number, mat: Material) {
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

  pushQuad(mesh, [0, 0, 0], [5.8, 0, 0], [0, 0, -4.9], [0, 1, 0], materials.floor);
  pushQuad(mesh, [0, 1.3, -3.3], [4.2, 0, 0], [0, 1.3, 0], [0, 0, 1], materials.backdrop);

  for (const [
    center,
    halfExtents,
    bevel,
    bevelHeight,
    sphereRadius,
    sphereMaterial,
  ] of spherePedestals) {
    pushBeveledPedestal(mesh, center, halfExtents, bevel, bevelHeight, materials.plinth);

    pushSphere(
      mesh,
      [center[0], center[1] + halfExtents[1] + sphereRadius, center[2]],
      sphereRadius,
      sphereMaterial,
    );
  }

  return { vertexCount: mesh.vertexCount, data: mesh.data };
}
