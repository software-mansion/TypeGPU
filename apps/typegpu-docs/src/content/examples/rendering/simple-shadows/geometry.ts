import * as d from 'typegpu/data';
import type { VertexInfo } from './object3d.ts';

export function createBoxGeometry(color: d.v4f): {
  vertices: d.Infer<VertexInfo>[];
  indices: number[];
} {
  // deno-fmt-ignore
  const indices = [
    0, 1, 2,  0, 2, 3,    // Front face
    4, 5, 6,  4, 6, 7,    // Back face
    8, 9, 10, 8, 10, 11,  // Left face
    12, 13, 14, 12, 14, 15, // Right face
    16, 17, 18, 16, 18, 19, // Top face
    20, 21, 22, 20, 22, 23, // Bottom face
  ];

  // Create separate vertices for each face with correct normals
  const vertices: d.Infer<VertexInfo>[] = [
    // Front face (-Z)
    { position: d.vec4f(-1, -1, -1, 1), normal: d.vec4f(0, 0, -1, 0), color },
    { position: d.vec4f(1, -1, -1, 1), normal: d.vec4f(0, 0, -1, 0), color },
    { position: d.vec4f(1, 1, -1, 1), normal: d.vec4f(0, 0, -1, 0), color },
    { position: d.vec4f(-1, 1, -1, 1), normal: d.vec4f(0, 0, -1, 0), color },

    // Back face (+Z)
    { position: d.vec4f(1, -1, 1, 1), normal: d.vec4f(0, 0, 1, 0), color },
    { position: d.vec4f(-1, -1, 1, 1), normal: d.vec4f(0, 0, 1, 0), color },
    { position: d.vec4f(-1, 1, 1, 1), normal: d.vec4f(0, 0, 1, 0), color },
    { position: d.vec4f(1, 1, 1, 1), normal: d.vec4f(0, 0, 1, 0), color },

    // Left face (-X)
    { position: d.vec4f(-1, -1, 1, 1), normal: d.vec4f(-1, 0, 0, 0), color },
    { position: d.vec4f(-1, -1, -1, 1), normal: d.vec4f(-1, 0, 0, 0), color },
    { position: d.vec4f(-1, 1, -1, 1), normal: d.vec4f(-1, 0, 0, 0), color },
    { position: d.vec4f(-1, 1, 1, 1), normal: d.vec4f(-1, 0, 0, 0), color },

    // Right face (+X)
    { position: d.vec4f(1, -1, -1, 1), normal: d.vec4f(1, 0, 0, 0), color },
    { position: d.vec4f(1, -1, 1, 1), normal: d.vec4f(1, 0, 0, 0), color },
    { position: d.vec4f(1, 1, 1, 1), normal: d.vec4f(1, 0, 0, 0), color },
    { position: d.vec4f(1, 1, -1, 1), normal: d.vec4f(1, 0, 0, 0), color },

    // Top face (+Y)
    { position: d.vec4f(-1, 1, -1, 1), normal: d.vec4f(0, 1, 0, 0), color },
    { position: d.vec4f(1, 1, -1, 1), normal: d.vec4f(0, 1, 0, 0), color },
    { position: d.vec4f(1, 1, 1, 1), normal: d.vec4f(0, 1, 0, 0), color },
    { position: d.vec4f(-1, 1, 1, 1), normal: d.vec4f(0, 1, 0, 0), color },

    // Bottom face (-Y)
    { position: d.vec4f(-1, -1, 1, 1), normal: d.vec4f(0, -1, 0, 0), color },
    { position: d.vec4f(1, -1, 1, 1), normal: d.vec4f(0, -1, 0, 0), color },
    { position: d.vec4f(1, -1, -1, 1), normal: d.vec4f(0, -1, 0, 0), color },
    { position: d.vec4f(-1, -1, -1, 1), normal: d.vec4f(0, -1, 0, 0), color },
  ];

  return { vertices, indices };
}

export function createPlaneGeometry(color: d.v4f, normal: d.v3f): {
  vertices: d.Infer<VertexInfo>[];
  indices: number[];
} {
  const indices = [0, 1, 2, 0, 2, 3];

  const vertices: d.Infer<VertexInfo>[] = [
    {
      position: d.vec4f(-1, -1, 0, 1),
      normal: d.vec4f(normal[0], normal[1], normal[2], 0),
      color,
    },
    {
      position: d.vec4f(1, -1, 0, 1),
      normal: d.vec4f(normal[0], normal[1], normal[2], 0),
      color,
    },
    {
      position: d.vec4f(1, 1, 0, 1),
      normal: d.vec4f(normal[0], normal[1], normal[2], 0),
      color,
    },
    {
      position: d.vec4f(-1, 1, 0, 1),
      normal: d.vec4f(normal[0], normal[1], normal[2], 0),
      color,
    },
  ];

  return { vertices, indices };
}
