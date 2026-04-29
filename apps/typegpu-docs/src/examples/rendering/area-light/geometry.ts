import type { ExampleVertex } from './schemas.ts';

type Vec3 = [number, number, number];

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function mul(v: Vec3, scale: number): Vec3 {
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0];
}

interface Material {
  albedo: Vec3;
  roughness: number;
  metallic: number;
}

function vertex(position: Vec3, normal: Vec3, mat: Material): ExampleVertex {
  return { position, normal, albedo: mat.albedo, roughness: mat.roughness, metallic: mat.metallic };
}

function pushQuad(
  vertices: ExampleVertex[],
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
  vertices.push(
    vertex(p0, normal, mat),
    vertex(p1, normal, mat),
    vertex(p2, normal, mat),
    vertex(p0, normal, mat),
    vertex(p2, normal, mat),
    vertex(p3, normal, mat),
  );
}

function pushSphere(vertices: ExampleVertex[], center: Vec3, radius: number, mat: Material) {
  const segments = 48;
  const rings = 24;

  function spherePoint(u: number, v: number): { position: Vec3; normal: Vec3 } {
    const theta = v * Math.PI;
    const phi = u * Math.PI * 2;
    const normal = normalize([
      Math.sin(theta) * Math.cos(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.sin(phi),
    ]);
    return { normal, position: add(center, mul(normal, radius)) };
  }

  for (let y = 0; y < rings; y++) {
    const v0 = y / rings;
    const v1 = (y + 1) / rings;

    for (let x = 0; x < segments; x++) {
      const u0 = x / segments;
      const u1 = (x + 1) / segments;
      const a = spherePoint(u0, v0);
      const b = spherePoint(u0, v1);
      const c = spherePoint(u1, v1);
      const d = spherePoint(u1, v0);

      vertices.push(
        vertex(a.position, a.normal, mat),
        vertex(b.position, b.normal, mat),
        vertex(c.position, c.normal, mat),
        vertex(a.position, a.normal, mat),
        vertex(c.position, c.normal, mat),
        vertex(d.position, d.normal, mat),
      );
    }
  }
}

export const initialLights = [
  {
    center: [0, 3.2, -0.6] as Vec3,
    dirX: [1, 0, 0] as Vec3,
    dirY: [0, 0, 1] as Vec3,
    halfSize: [1.25, 0.75] as [number, number],
    color: [1, 0.78, 0.45] as Vec3,
    intensity: 5.5,
  },
  {
    center: [-3.4, 1.6, 1.8] as Vec3,
    dirX: [0, 0, 1] as Vec3,
    dirY: [0, 1, 0] as Vec3,
    halfSize: [0.7, 0.95] as [number, number],
    color: [0.35, 0.55, 1.0] as Vec3,
    intensity: 4.0,
  },
];

const FLOOR_MATERIAL: Material = { albedo: [0.85, 0.83, 0.78], roughness: 0.08, metallic: 0 };
const BACK_WALL: Material = { albedo: [0.32, 0.36, 0.44], roughness: 0.55, metallic: 0 };
const LEFT_WALL: Material = { albedo: [0.55, 0.32, 0.3], roughness: 0.5, metallic: 0 };
const RIGHT_WALL: Material = { albedo: [0.28, 0.42, 0.36], roughness: 0.5, metallic: 0 };
const GOLD_SPHERE: Material = { albedo: [1.0, 0.78, 0.36], roughness: 0.08, metallic: 1 };
const PLASTIC_SPHERE: Material = { albedo: [0.16, 0.28, 0.5], roughness: 0.4, metallic: 0 };

export function createSceneVertices() {
  const vertices: ExampleVertex[] = [];

  pushQuad(vertices, [0, 0, 0], [4.5, 0, 0], [0, 0, -4.5], [0, 1, 0], FLOOR_MATERIAL);
  pushQuad(vertices, [0, 1.8, -4.5], [4.5, 0, 0], [0, 1.8, 0], [0, 0, 1], BACK_WALL);
  pushQuad(vertices, [-4.5, 1.8, 0], [0, 0, -4.5], [0, 1.8, 0], [1, 0, 0], LEFT_WALL);
  pushQuad(vertices, [4.5, 1.8, 0], [0, 0, 4.5], [0, 1.8, 0], [-1, 0, 0], RIGHT_WALL);

  pushSphere(vertices, [-1.15, 0.82, -1.35], 0.82, GOLD_SPHERE);
  pushSphere(vertices, [1.2, 0.58, 0.25], 0.58, PLASTIC_SPHERE);

  return vertices;
}
