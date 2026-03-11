import { d } from 'typegpu';
import { CubeVertex } from './schemas.ts';

function vert(position: [number, number, number], uv: [number, number]) {
  return CubeVertex({
    position: d.vec4f(...position, 1),
    uv: d.vec2f(...uv),
  });
}

// TODO: normals
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
