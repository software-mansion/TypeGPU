import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// TODO: replace `s = s &&` with `s &&=` when implemented
export const fluentOperatorsTests = tgpu['~unstable']
  .fn([], d.bool)
  .does(() => {
    let s = true;

    s = s && std.isCloseTo(d.vec2f(1, 2).mul(2), d.vec2f(2, 4));
    s = s && std.allEq(d.vec3u(2, 3, 4).mul(3), d.vec3u(6, 9, 12));
    s = s && std.allEq(d.vec4i(3, 4, 5, 6).mul(4), d.vec4i(12, 16, 20, 24));

    s = s && std.allEq(d.vec2i(1, 2).mul(d.vec2i(3, 4)), d.vec2i(3, 8));

    s = s && std.allEq(d.vec2u(1, 2).mul(2).mul(3), d.vec2u(6, 12));
    s =
      s &&
      std.isCloseTo(
        d.mat2x2f(1, 2, 3, 4).mul(2).mul(d.vec2f(1, 10)),
        d.vec2f(62, 84),
      );
    s =
      s &&
      std.isCloseTo(
        d
          .vec2f(1, 10)
          .mul(d.mat2x2f(1, 2, 3, 4))
          .mul(-1),
        d.vec2f(-21, -43),
      );
    s =
      s &&
      std.isCloseTo(
        d
          .vec2f(1, 10)
          .mul(-1)
          .mul(d.mat2x2f(1, 2, 3, 4)),
        d.vec2f(-21, -43),
      );
    s =
      s &&
      std.allEq(
        d
          .vec3f(1, 10, 100)
          .mul(d.mat3x3f(0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5))
          .mul(-1)
          .mul(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9))
          .mul(-1)
          .mul(d.mat3x3f(2, 0, 0, 0, 2, 0, 0, 0, 2)),
        d.vec3f(321, 654, 987),
      );

    return s;
  });

console.log(tgpu.resolve({ externals: { fluentOperatorsTests } }));
