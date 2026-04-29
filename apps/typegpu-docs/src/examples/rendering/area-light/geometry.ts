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

function pushBox(vertices: ExampleVertex[], center: Vec3, halfExtents: Vec3, mat: Material) {
  const [hx, hy, hz] = halfExtents;

  pushQuad(
    vertices,
    [center[0], center[1] + hy, center[2]],
    [hx, 0, 0],
    [0, 0, -hz],
    [0, 1, 0],
    mat,
  );
  pushQuad(
    vertices,
    [center[0], center[1] - hy, center[2]],
    [hx, 0, 0],
    [0, 0, hz],
    [0, -1, 0],
    mat,
  );
  pushQuad(
    vertices,
    [center[0], center[1], center[2] + hz],
    [hx, 0, 0],
    [0, hy, 0],
    [0, 0, 1],
    mat,
  );
  pushQuad(
    vertices,
    [center[0], center[1], center[2] - hz],
    [hx, 0, 0],
    [0, hy, 0],
    [0, 0, -1],
    mat,
  );
  pushQuad(
    vertices,
    [center[0] - hx, center[1], center[2]],
    [0, 0, hz],
    [0, hy, 0],
    [-1, 0, 0],
    mat,
  );
  pushQuad(
    vertices,
    [center[0] + hx, center[1], center[2]],
    [0, 0, hz],
    [0, hy, 0],
    [1, 0, 0],
    mat,
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
    center: [0, 3.05, -0.55] as Vec3,
    dirX: [1, 0, 0] as Vec3,
    dirY: [0, 0, 1] as Vec3,
    halfSize: [1.25, 0.75] as [number, number],
    color: [1, 0.16, 0.74] as Vec3,
    intensity: 9.0,
  },
  {
    center: [-3.4, 1.6, 1.8] as Vec3,
    dirX: [0, 0, 1] as Vec3,
    dirY: [0, 1, 0] as Vec3,
    halfSize: [0.7, 0.95] as [number, number],
    color: [0.05, 0.78, 1.0] as Vec3,
    intensity: 6.5,
  },
  {
    center: [3.1, 1.45, -2.5] as Vec3,
    dirX: [1, 0, 0] as Vec3,
    dirY: [0, 1, 0] as Vec3,
    halfSize: [0.55, 0.8] as [number, number],
    color: [0.25, 1.0, 0.52] as Vec3,
    intensity: 5.2,
  },
];

const FLOOR_MATERIAL: Material = { albedo: [0.025, 0.028, 0.032], roughness: 0.08, metallic: 0 };
const BACKDROP_MATERIAL: Material = { albedo: [0.018, 0.021, 0.029], roughness: 0.42, metallic: 0 };
const PLINTH_MATERIAL: Material = { albedo: [0.045, 0.048, 0.047], roughness: 0.12, metallic: 0 };
const DARK_BLOCK_MATERIAL: Material = {
  albedo: [0.025, 0.027, 0.034],
  roughness: 0.18,
  metallic: 0,
};
const GOLD_SPHERE: Material = { albedo: [1.0, 0.62, 0.18], roughness: 0.18, metallic: 0.55 };
const CERAMIC_SPHERE: Material = { albedo: [0.18, 0.22, 0.22], roughness: 0.16, metallic: 0 };
const PLASTIC_SPHERE: Material = { albedo: [0.025, 0.07, 0.18], roughness: 0.16, metallic: 0 };

export function createSceneVertices() {
  const vertices: ExampleVertex[] = [];

  pushQuad(vertices, [0, 0, 0], [5, 0, 0], [0, 0, -4.2], [0, 1, 0], FLOOR_MATERIAL);
  pushQuad(vertices, [0, 1.45, -3.3], [4.2, 0, 0], [0, 1.45, 0], [0, 0, 1], BACKDROP_MATERIAL);

  pushBox(vertices, [0, 0.08, -0.7], [2.55, 0.08, 1.25], PLINTH_MATERIAL);
  pushBox(vertices, [-2.55, 0.22, 0.9], [0.55, 0.22, 0.55], DARK_BLOCK_MATERIAL);
  pushBox(vertices, [2.25, 0.14, 0.75], [0.65, 0.14, 0.45], PLINTH_MATERIAL);

  pushSphere(vertices, [-1.25, 0.88, -1.1], 0.72, GOLD_SPHERE);
  pushSphere(vertices, [0.3, 0.54, 0.35], 0.38, CERAMIC_SPHERE);
  pushSphere(vertices, [1.25, 0.72, -0.45], 0.56, PLASTIC_SPHERE);
  pushSphere(vertices, [-2.55, 0.92, 0.9], 0.48, PLASTIC_SPHERE);

  return vertices;
}
