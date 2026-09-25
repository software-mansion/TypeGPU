import { d } from 'typegpu';
import { quat, vec3, type Quat, type Vec3 } from 'math';
import { quickhull3 } from 'math/geometry';
import { mulberry32 } from 'math/random';

export const MeshVertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

export const TreeVertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  material: d.u32,
});

function mirrorX(points: Vec3[]): number[] {
  return points.flatMap(([x, y, z]) => [x, y, z, -x, y, z]);
}

function ring(count: number, radius: number, y: number, jitter = () => 1): number[] {
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = radius * jitter();
    points.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  return points;
}

/**
 * Every part is a convex, faceted solid. We describe each one as a point cloud and let
 * `quickhull3` from `math/geometry` wrap it into triangles.
 */
const shapePoints = {
  // A unit cube with its edges shaved off - reads as machined metal once outlined.
  chamfer: (() => {
    const c = 0.14;
    const points: number[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          points.push(sx * 0.5, sy * (0.5 - c), sz * (0.5 - c));
          points.push(sx * (0.5 - c), sy * 0.5, sz * (0.5 - c));
          points.push(sx * (0.5 - c), sy * (0.5 - c), sz * 0.5);
        }
      }
    }
    return points;
  })(),
  // A 14-sided prism along Y.
  cylinder: [...ring(14, 0.5, -0.5), ...ring(14, 0.5, 0.5)],
  // A faceted ball, with points distributed on a Fibonacci spiral.
  sphere: (() => {
    const points: number[] = [];
    const count = 42;
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count;
      const r = Math.sqrt(1 - y * y);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      points.push(Math.cos(a) * r * 0.5, y * 0.5, Math.sin(a) * r * 0.5);
    }
    return points;
  })(),
  // Broad shoulders tapering into the waist, with a chest that juts forward.
  chest: mirrorX([
    [0.5, 0.5, -0.4],
    [0.5, 0.5, 0.3],
    [0.46, 0.1, 0.5],
    [0.5, 0.05, -0.5],
    [0.3, -0.5, -0.3],
    [0.3, -0.5, 0.3],
    [0.2, 0.35, 0.5],
  ]),
  // A helmet with a flat, slanted face for the visor.
  helmet: mirrorX([
    [0.42, 0.5, -0.5],
    [0.5, 0.1, -0.5],
    [0.45, -0.5, -0.3],
    [0.4, -0.5, 0.35],
    [0.44, 0.1, 0.5],
    [0.3, 0.45, 0.25],
  ]),
  // A tapered block, used for toes.
  toe: mirrorX([
    [0.5, 0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.3, 0.05, 0.5],
    [0.34, -0.5, 0.5],
  ]),
};

export type ShapeName = keyof typeof shapePoints;

function hullTriangles(points: number[]) {
  const indices = quickhull3(points);
  const centroid = vec3.create();
  for (let i = 0; i < points.length; i += 3) {
    vec3.add(centroid, centroid, [points[i], points[i + 1], points[i + 2]]);
  }
  vec3.scale(centroid, centroid, 3 / points.length);

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const at = (i: number): Vec3 => [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
  const ab = vec3.create();
  const ac = vec3.create();
  const outward = vec3.create();

  for (let t = 0; t < indices.length; t += 3) {
    const a = at(indices[t]);
    let b = at(indices[t + 1]);
    let c = at(indices[t + 2]);
    const n = vec3.cross(vec3.create(), vec3.sub(ab, b, a), vec3.sub(ac, c, a));
    vec3.normalize(n, n);
    // Make sure every face winds counter-clockwise when seen from the outside.
    if (vec3.dot(n, vec3.sub(outward, a, centroid)) < 0) {
      [b, c] = [c, b];
      vec3.negate(n, n);
    }
    positions.push(a, b, c);
    normals.push(n, n, n);
  }
  return { positions, normals };
}

export interface ShapeRange {
  firstVertex: number;
  vertexCount: number;
}

/**
 * Builds a single vertex list holding every shape back to back, plus the range of each one.
 */
export function buildShapes() {
  const vertices: { position: Vec3; normal: Vec3 }[] = [];
  const ranges = {} as Record<ShapeName, ShapeRange>;

  for (const name of Object.keys(shapePoints) as ShapeName[]) {
    const { positions, normals } = hullTriangles(shapePoints[name]);
    ranges[name] = { firstVertex: vertices.length, vertexCount: positions.length };
    for (let i = 0; i < positions.length; i++) {
      vertices.push({ position: positions[i], normal: normals[i] });
    }
  }

  return { vertices, ranges };
}

// #region Trees

export const TREE_TRUNK = 3;
export const TREE_FOLIAGE = 1;
/** The center and radius of a sphere enclosing every tree, used to capture impostors. */
export const TREE_BOUNDS = { center: [0, 5, 0] as Vec3, radius: 5.4 };

/**
 * A stylized conifer: a trunk and a stack of slightly irregular, faceted cones.
 */
export function buildTree() {
  const rng = mulberry32.create(21);
  const jitter = () => 0.85 + 0.3 * mulberry32.sample(rng);
  const vertices: { position: Vec3; normal: Vec3; material: number }[] = [];
  const rotation: Quat = quat.create();
  const _p = vec3.create();

  const addHull = (points: number[], material: number, offset: Vec3, yaw: number) => {
    const { positions, normals } = hullTriangles(points);
    quat.setAxisAngle(rotation, [0, 1, 0], yaw);
    for (let i = 0; i < positions.length; i++) {
      vec3.add(_p, vec3.transformQuat(_p, positions[i], rotation), offset);
      vertices.push({
        position: vec3.clone(_p),
        normal: vec3.transformQuat(vec3.create(), normals[i], rotation),
        material,
      });
    }
  };

  addHull([...ring(7, 0.32, 0), ...ring(7, 0.2, 3.2)], TREE_TRUNK, [0, -0.4, 0], 0);
  const tiers = [
    { y: 1.6, radius: 2.9, height: 3.4 },
    { y: 3.5, radius: 2.3, height: 3.1 },
    { y: 5.3, radius: 1.7, height: 2.8 },
    { y: 7.0, radius: 1.0, height: 2.5 },
  ];
  tiers.forEach(({ y, radius, height }, i) => {
    addHull([...ring(9, radius, 0, jitter), 0, height, 0], TREE_FOLIAGE, [0, y, 0], i * 0.7);
  });

  return vertices;
}

// #endregion
