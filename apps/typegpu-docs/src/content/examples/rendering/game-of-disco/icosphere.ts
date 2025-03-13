import * as d from 'typegpu/data';
import { Vertex } from './dataTypes';

/**
 * Creates an icosphere with the specified level of subdivision
 * @param subdivisions Number of recursive subdivisions to apply
 * @returns Array of vertices defining the icosphere triangles
 */
export function createIcosphere(
  subdivisions: number,
): d.Infer<typeof Vertex>[] {
  const maxSafeSubdivisions = 8;
  const actualSubdivisions = Math.min(subdivisions, maxSafeSubdivisions);

  if (subdivisions > maxSafeSubdivisions) {
    console.warn(
      `Requested ${subdivisions} subdivisions, but limiting to ${maxSafeSubdivisions} to prevent too many vertices`,
    );
  }

  // Golden ratio for icosahedron construction
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  // Define initial icosahedron vertices
  const initialVertices: d.v4f[] = [
    // Top group
    d.vec4f(-1, goldenRatio, 0, 1),
    d.vec4f(1, goldenRatio, 0, 1),
    d.vec4f(-1, -goldenRatio, 0, 1),
    d.vec4f(1, -goldenRatio, 0, 1),

    // Middle group
    d.vec4f(0, -1, goldenRatio, 1),
    d.vec4f(0, 1, goldenRatio, 1),
    d.vec4f(0, -1, -goldenRatio, 1),
    d.vec4f(0, 1, -goldenRatio, 1),

    // Bottom group
    d.vec4f(goldenRatio, 0, -1, 1),
    d.vec4f(goldenRatio, 0, 1, 1),
    d.vec4f(-goldenRatio, 0, -1, 1),
    d.vec4f(-goldenRatio, 0, 1, 1),
  ].map((v) => {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
  });

  // Define the 20 triangular faces of the icosahedron using vertex indices
  const faces: [number, number, number][] = [
    // 5 faces around vertex 0
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    // 5 adjacent faces
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    // 5 faces around vertex 3
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    // 5 adjacent faces
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  // Container for the final vertex list
  const vertices: d.Infer<typeof Vertex>[] = [];

  // Subdivide each face recursively
  for (const [i1, i2, i3] of faces) {
    subdivideTriangle(
      initialVertices[i1],
      initialVertices[i2],
      initialVertices[i3],
      actualSubdivisions,
      vertices,
    );
  }

  return vertices;
}

/**
 * Recursively subdivides a triangle until desired depth is reached
 */
function subdivideTriangle(
  v1: d.v4f,
  v2: d.v4f,
  v3: d.v4f,
  depth: number,
  vertices: ReturnType<typeof Vertex>[],
): void {
  if (depth === 0) {
    // Base case: add the triangle vertices
    vertices.push(createVertex(v1));
    vertices.push(createVertex(v2));
    vertices.push(createVertex(v3));
    return;
  }

  // Calculate midpoints of each edge and project them onto the unit sphere
  const v12 = normalizeSafely(calculateMidpoint(v1, v2));
  const v23 = normalizeSafely(calculateMidpoint(v2, v3));
  const v31 = normalizeSafely(calculateMidpoint(v3, v1));

  // Recursively subdivide the four resulting triangles
  subdivideTriangle(v1, v12, v31, depth - 1, vertices);
  subdivideTriangle(v2, v23, v12, depth - 1, vertices);
  subdivideTriangle(v3, v31, v23, depth - 1, vertices);
  subdivideTriangle(v12, v23, v31, depth - 1, vertices);
}

/**
 * Calculates the midpoint between two vertices
 */
function calculateMidpoint(v1: d.v4f, v2: d.v4f): d.v4f {
  return d.vec4f(
    (v1.x + v2.x) * 0.5,
    (v1.y + v2.y) * 0.5,
    (v1.z + v2.z) * 0.5,
    1,
  );
}

/**
 * Creates a vertex with position, color, and normal
 * For a unit sphere, the normal equals the normalized position
 */
function createVertex(position: d.v4f): ReturnType<typeof Vertex> {
  const color = d.vec4f(0.8, 1, 1, 1); // White color
  const normal = position;

  return Vertex({
    position,
    color,
    normal,
  });
}

/**
 * Safely normalizes a vector to prevent numerical instability
 */
function normalizeSafely(v: d.v4f): d.v4f {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (length < 1e-8) {
    return d.vec4f(0, 0, 1, 1);
  }
  return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
}
