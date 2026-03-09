import { d } from 'typegpu';
import { CubeVertex } from './schemas.ts';

function vert(position: [number, number, number], uv: [number, number]) {
  return CubeVertex({
    position: d.vec4f(...position, 1),
    uv: d.vec2f(...uv),
  });
}

export const cubeVertices: d.Infer<typeof CubeVertex>[] = [
  // Bottom face
  vert([0, 0, 0], [0, 0]),
  vert([1, 0, 0], [1, 0]),
  vert([1, 0, 1], [1, 1]),
  vert([1, 0, 1], [1, 1]),
  vert([0, 0, 1], [0, 1]),
  vert([0, 0, 0], [0, 0]),

  // Right face
  vert([1, 1, 1], [0, 1]),
  vert([1, 0, 1], [1, 1]),
  vert([1, 0, 0], [1, 0]),
  vert([1, 1, 0], [0, 0]),
  vert([1, 1, 1], [0, 1]),
  vert([1, 0, 0], [1, 0]),

  // Top face
  vert([0, 1, 1], [0, 1]),
  vert([1, 1, 1], [1, 1]),
  vert([1, 1, 0], [1, 0]),
  vert([0, 1, 0], [0, 0]),
  vert([0, 1, 1], [0, 1]),
  vert([1, 1, 0], [1, 0]),

  // Left face
  vert([0, 0, 1], [0, 1]),
  vert([0, 1, 1], [1, 1]),
  vert([0, 1, 0], [1, 0]),
  vert([0, 0, 0], [0, 0]),
  vert([0, 0, 1], [0, 1]),
  vert([0, 1, 0], [1, 0]),

  // Front face
  vert([1, 1, 1], [0, 1]),
  vert([0, 1, 1], [1, 1]),
  vert([0, 0, 1], [1, 0]),
  vert([0, 0, 1], [1, 0]),
  vert([1, 0, 1], [0, 0]),
  vert([1, 1, 1], [0, 1]),

  // Back face
  vert([1, 0, 0], [0, 1]),
  vert([0, 0, 0], [1, 1]),
  vert([0, 1, 0], [1, 0]),
  vert([1, 1, 0], [0, 0]),
  vert([1, 0, 0], [0, 1]),
  vert([0, 1, 0], [1, 0]),
];

// TODO: normals
// TODO: remove duplication
export const faces = {
  bottom: [
    vert([0, 0, 0], [0, 0]),
    vert([1, 0, 0], [1, 0]),
    vert([1, 0, 1], [1, 1]),
    vert([1, 0, 1], [1, 1]),
    vert([0, 0, 1], [0, 1]),
    vert([0, 0, 0], [0, 0]),
  ],
  right: [
    vert([1, 1, 1], [0, 1]),
    vert([1, 0, 1], [1, 1]),
    vert([1, 0, 0], [1, 0]),
    vert([1, 1, 0], [0, 0]),
    vert([1, 1, 1], [0, 1]),
    vert([1, 0, 0], [1, 0]),
  ],
  top: [
    vert([0, 1, 1], [0, 1]),
    vert([1, 1, 1], [1, 1]),
    vert([1, 1, 0], [1, 0]),
    vert([0, 1, 0], [0, 0]),
    vert([0, 1, 1], [0, 1]),
    vert([1, 1, 0], [1, 0]),
  ],
  left: [
    vert([0, 0, 1], [0, 1]),
    vert([0, 1, 1], [1, 1]),
    vert([0, 1, 0], [1, 0]),
    vert([0, 0, 0], [0, 0]),
    vert([0, 0, 1], [0, 1]),
    vert([0, 1, 0], [1, 0]),
  ],
  front: [
    vert([1, 1, 1], [0, 1]),
    vert([0, 1, 1], [1, 1]),
    vert([0, 0, 1], [1, 0]),
    vert([0, 0, 1], [1, 0]),
    vert([1, 0, 1], [0, 0]),
    vert([1, 1, 1], [0, 1]),
  ],
  back: [
    vert([1, 0, 0], [0, 1]),
    vert([0, 0, 0], [1, 1]),
    vert([0, 1, 0], [1, 0]),
    vert([1, 1, 0], [0, 0]),
    vert([1, 0, 0], [0, 1]),
    vert([0, 1, 0], [1, 0]),
  ],
};
