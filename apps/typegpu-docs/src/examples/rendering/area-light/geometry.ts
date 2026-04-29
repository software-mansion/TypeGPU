import type { ExampleVertex } from './schemas.ts';

type Vec3 = [number, number, number];

const black: Vec3 = [0, 0, 0];

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

function vertex(
  position: Vec3,
  normal: Vec3,
  albedo: Vec3,
  roughness: number,
  emissive: Vec3 = black,
): ExampleVertex {
  return { position, normal, albedo, roughness, emissive };
}

function pushQuad(
  vertices: ExampleVertex[],
  center: Vec3,
  axisU: Vec3,
  axisV: Vec3,
  normal: Vec3,
  albedo: Vec3,
  roughness: number,
  emissive: Vec3 = black,
) {
  const p0 = sub(sub(center, axisU), axisV);
  const p1 = sub(add(center, axisU), axisV);
  const p2 = add(add(center, axisU), axisV);
  const p3 = add(sub(center, axisU), axisV);
  vertices.push(
    vertex(p0, normal, albedo, roughness, emissive),
    vertex(p1, normal, albedo, roughness, emissive),
    vertex(p2, normal, albedo, roughness, emissive),
    vertex(p0, normal, albedo, roughness, emissive),
    vertex(p2, normal, albedo, roughness, emissive),
    vertex(p3, normal, albedo, roughness, emissive),
  );
}

function pushSphere(
  vertices: ExampleVertex[],
  center: Vec3,
  radius: number,
  albedo: Vec3,
  roughness: number,
) {
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
        vertex(a.position, a.normal, albedo, roughness),
        vertex(b.position, b.normal, albedo, roughness),
        vertex(c.position, c.normal, albedo, roughness),
        vertex(a.position, a.normal, albedo, roughness),
        vertex(c.position, c.normal, albedo, roughness),
        vertex(d.position, d.normal, albedo, roughness),
      );
    }
  }
}

export const initialLight = {
  center: [0, 3.2, -0.6] as Vec3,
  dirX: [1, 0, 0] as Vec3,
  dirY: [0, 0, 1] as Vec3,
  halfSize: [1.25, 0.75] as [number, number],
  color: [1, 0.78, 0.45] as Vec3,
  intensity: 5.5,
};

export function createSceneVertices(light = initialLight, surfaceRoughness?: number) {
  const vertices: ExampleVertex[] = [];
  const floorRoughness = surfaceRoughness ?? 0.55;
  const wallRoughness = surfaceRoughness ?? 0.42;
  const sphereRoughness = surfaceRoughness ?? 0.18;
  const blueSphereRoughness = surfaceRoughness ?? 0.46;

  pushQuad(
    vertices,
    [0, 0, 0],
    [4.5, 0, 0],
    [0, 0, -4.5],
    [0, 1, 0],
    [0.72, 0.7, 0.65],
    floorRoughness,
  );
  pushQuad(
    vertices,
    [0, 1.8, -4.5],
    [4.5, 0, 0],
    [0, 1.8, 0],
    [0, 0, 1],
    [0.48, 0.53, 0.61],
    wallRoughness,
  );
  pushQuad(
    vertices,
    [-4.5, 1.8, 0],
    [0, 0, -4.5],
    [0, 1.8, 0],
    [1, 0, 0],
    [0.6, 0.44, 0.42],
    wallRoughness,
  );
  pushQuad(
    vertices,
    [4.5, 1.8, 0],
    [0, 0, 4.5],
    [0, 1.8, 0],
    [-1, 0, 0],
    [0.4, 0.52, 0.48],
    wallRoughness,
  );

  pushSphere(vertices, [-1.15, 0.82, -1.35], 0.82, [0.82, 0.87, 0.9], sphereRoughness);
  pushSphere(vertices, [1.2, 0.58, 0.25], 0.58, [0.38, 0.62, 0.74], blueSphereRoughness);

  pushQuad(
    vertices,
    light.center,
    mul(light.dirX, light.halfSize[0]),
    mul(light.dirY, light.halfSize[1]),
    [0, -1, 0],
    [1, 1, 1],
    0.2,
    light.color.map((channel) => channel * light.intensity) as Vec3,
  );

  return vertices;
}
