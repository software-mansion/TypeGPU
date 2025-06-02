import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// TODO: replace `s = s &&` with `s &&=` when implemented
export const matrixOps = tgpu['~unstable']
  .fn([], d.bool)(() => {
    let s = true;

    s = s &&
      std.isCloseTo(
        std.mul(d.mat4x4f.translation(d.vec3f(-1, 0, 1)), d.vec4f(1, 2, 3, 1)),
        d.vec4f(0, 2, 4, 1),
      );

    s = s &&
      std.isCloseTo(
        std.mul(d.mat4x4f.scaling(d.vec3f(-1, 0, 1)), d.vec4f(1, 2, 3, 1)),
        d.vec4f(-1, 0, 3, 1),
      );

    s = s &&
      std.isCloseTo(
        std.mul(d.mat4x4f.rotationXY(Math.PI / 2), d.vec4f(1, 2, 3, 1)),
        d.vec4f(-2, 1, 3, 1),
      );

    s = s &&
      std.isCloseTo(
        std.mul(d.mat4x4f.rotationYZ(Math.PI / 2), d.vec4f(1, 2, 3, 1)),
        d.vec4f(1, -3, 2, 1),
      );

    s = s &&
      std.isCloseTo(
        std.mul(d.mat4x4f.rotationZX(Math.PI / 2), d.vec4f(1, 2, 3, 1)),
        d.vec4f(3, 2, -1, 1),
      );

    return s;
  });
