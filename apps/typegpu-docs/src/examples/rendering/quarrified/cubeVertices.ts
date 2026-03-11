import { d } from 'typegpu';
import { CubeVertex } from './schemas.ts';

function vert(position: [number, number, number], uv: [number, number]) {
  return CubeVertex({
    position: d.vec4f(...position, 1),
    uv: d.vec2f(...uv),
  });
}

// TODO: normals
// 4 vertices per face for triangle-strip topology.
// T0: v0,v1,v2  T1: v2,v1,v3 (WebGPU odd-triangle winding flip)
export const faces = {
  bottom: [
    vert([1, 0, 0], [1, 0]),
    vert([1, 0, 1], [1, 1]),
    vert([0, 0, 0], [0, 0]),
    vert([0, 0, 1], [0, 1]),
  ],
  right: [
    vert([1, 0, 1], [1, 1]),
    vert([1, 0, 0], [1, 0]),
    vert([1, 1, 1], [0, 1]),
    vert([1, 1, 0], [0, 0]),
  ],
  top: [
    vert([1, 1, 1], [1, 1]),
    vert([1, 1, 0], [1, 0]),
    vert([0, 1, 1], [0, 1]),
    vert([0, 1, 0], [0, 0]),
  ],
  left: [
    vert([0, 1, 1], [1, 1]),
    vert([0, 1, 0], [1, 0]),
    vert([0, 0, 1], [0, 1]),
    vert([0, 0, 0], [0, 0]),
  ],
  front: [
    vert([0, 1, 1], [1, 1]),
    vert([0, 0, 1], [1, 0]),
    vert([1, 1, 1], [0, 1]),
    vert([1, 0, 1], [0, 0]),
  ],
  back: [
    vert([0, 0, 0], [1, 1]),
    vert([0, 1, 0], [1, 0]),
    vert([1, 0, 0], [0, 1]),
    vert([1, 1, 0], [0, 0]),
  ],
};
