import tgpu, { d, std } from 'typegpu';

// TODO: replace `s = s &&` with `s &&=` when implemented
export const matrixOpsTests = tgpu.fn(
  [],
  d.bool,
)(() => {
  let s = true;

  s =
    s &&
    std.isCloseTo(
      std.mul(d.mat4x4f.translation(d.vec3f(-1, 0, 1)), d.vec4f(1, 2, 3, 1)),
      d.vec4f(0, 2, 4, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(d.mat4x4f.scaling(d.vec3f(-1, 0, 1)), d.vec4f(1, 2, 3, 1)),
      d.vec4f(-1, 0, 3, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(d.mat4x4f.rotationX(Math.PI / 2), d.vec4f(1, 2, 3, 1)),
      d.vec4f(1, -3, 2, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(d.mat4x4f.rotationY(Math.PI / 2), d.vec4f(1, 2, 3, 1)),
      d.vec4f(3, 2, -1, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(d.mat4x4f.rotationZ(Math.PI / 2), d.vec4f(1, 2, 3, 1)),
      d.vec4f(-2, 1, 3, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(std.translate4(d.mat4x4f.identity(), d.vec3f(-1, 0, 1)), d.vec4f(1, 2, 3, 1)),
      d.vec4f(0, 2, 4, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(std.scale4(d.mat4x4f.identity(), d.vec3f(-1, 0, 1)), d.vec4f(1, 2, 3, 1)),
      d.vec4f(-1, 0, 3, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(std.rotateX4(d.mat4x4f.identity(), Math.PI / 2), d.vec4f(1, 2, 3, 1)),
      d.vec4f(1, -3, 2, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(std.rotateY4(d.mat4x4f.identity(), Math.PI / 2), d.vec4f(1, 2, 3, 1)),
      d.vec4f(3, 2, -1, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(std.rotateZ4(d.mat4x4f.identity(), Math.PI / 2), d.vec4f(1, 2, 3, 1)),
      d.vec4f(-2, 1, 3, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(
        std.rotateZ4(std.rotateX4(d.mat4x4f.identity(), Math.PI / 2), Math.PI / 2),
        d.vec4f(1, 0, 0, 1),
      ),
      d.vec4f(0, 1, 0, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(
        std.rotateX4(std.rotateZ4(d.mat4x4f.identity(), Math.PI / 2), Math.PI / 2),
        d.vec4f(1, 0, 0, 1),
      ),
      d.vec4f(0, 0, 1, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(
        std.translate4(std.scale4(d.mat4x4f.identity(), d.vec3f(2, 3, 4)), d.vec3f(0, 1, 0)),
        d.vec4f(1, 0, 0, 1),
      ),
      d.vec4f(2, 1, 0, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(
        std.scale4(std.translate4(d.mat4x4f.identity(), d.vec3f(0, 1, 0)), d.vec3f(2, 3, 4)),
        d.vec4f(0, 0, 0, 1),
      ),
      d.vec4f(0, 3, 0, 1),
    );

  s =
    s &&
    std.isCloseTo(
      std.mul(
        std.rotateZ4(std.rotateY4(d.mat4x4f.identity(), Math.PI / 2), Math.PI / 2),
        d.vec4f(0, 1, 0, 1),
      ),
      d.vec4f(-1, 0, 0, 1),
    );

  return s;
});
