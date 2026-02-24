// oxlint-disable typescript/no-unnecessary-boolean-literal-compare this is a test
import tgpu, { d, std } from 'typegpu';

const Schema = d.struct({
  vec2b: d.vec2b,
  vec4b: d.vec4b,
  vec3b: d.vec3b,
  bool: d.bool,
});

const negate = tgpu.fn([d.vec3b], d.vec3b)((input) =>
  d.vec3b(!input.x, !input.y, !input.z)
);

const negateStruct = tgpu.fn([Schema], Schema)((input) => {
  const result = Schema({
    vec2b: std.not(input.vec2b),
    vec4b: std.not(input.vec4b),
    vec3b: std.not(input.vec3b),
    bool: !input.bool,
  });
  return result;
});

// TODO: replace `s = s &&` with `s &&=` when implemented
export const logicalExpressionTests = tgpu.fn([], d.bool)(() => {
  let s = true;

  s = s && std.eq(d.vec2i(1, 3), d.vec2i(1, 3)).x === true;
  s = s && std.eq(d.vec2i(1, 3), d.vec2i(1, 3)).y === true;
  s = s && std.eq(d.vec2i(1, 3), d.vec2i(1, 2)).x === true;
  s = s && std.eq(d.vec2i(1, 3), d.vec2i(1, 2)).y === false;

  s = s && std.all(d.vec4b(true, true, true, true));
  s = s && !std.all(d.vec4b(true, false, true, true));

  s = s && std.any(d.vec4b(false, false, true, false));
  s = s && !std.any(d.vec4b(false, false, false, false));

  s = s && std.allEq(d.vec2i(1, 3), d.vec2i(1, 3));
  s = s && !std.allEq(d.vec2i(1, 3), d.vec2i(1, 2));

  s = s &&
    std.allEq(
      std.ne(d.vec3i(1, 2, 3), d.vec3i(1, 2, 4)),
      d.vec3b(false, false, true),
    );

  s = s &&
    std.allEq(
      std.lt(d.vec3f(1.0, -1.0, 0.0), d.vec3f(1.0, 1.0, -1.0)),
      d.vec3b(false, true, false),
    );

  s = s &&
    std.allEq(
      std.le(d.vec3f(1.0, -1.0, 0.0), d.vec3f(1.0, 1.0, -1.0)),
      d.vec3b(true, true, false),
    );

  s = s &&
    std.allEq(
      std.gt(d.vec3f(1.0, -1.0, 0.0), d.vec3f(1.0, 1.0, -1.0)),
      d.vec3b(false, false, true),
    );

  s = s &&
    std.allEq(
      std.ge(d.vec3f(1.0, -1.0, 0.0), d.vec3f(1.0, 1.0, -1.0)),
      d.vec3b(true, false, true),
    );

  s = s && std.allEq(std.not(d.vec2b(false, true)), d.vec2b(true, false));

  s = s &&
    std.allEq(
      std.or(
        d.vec4b(true, true, false, false),
        d.vec4b(true, false, true, false),
      ),
      d.vec4b(true, true, true, false),
    );

  s = s &&
    std.allEq(
      std.and(
        d.vec4b(true, true, false, false),
        d.vec4b(true, false, true, false),
      ),
      d.vec4b(true, false, false, false),
    );

  s = s && std.isCloseTo(d.vec3f(1.0, 1.0, 1.0), d.vec3f(0.999, 1.0, 1.001));
  s = s && !std.isCloseTo(d.vec3f(1.0, 1.0, 1.0), d.vec3f(0.9, 1.0, 1.1));
  s = s && std.isCloseTo(d.vec3f(1.0, 1.0, 1.0), d.vec3f(0.9, 1.0, 1.1), 0.2);
  s = s &&
    !std.isCloseTo(d.vec3f(1.0, 1.0, 1.0), d.vec3f(0.7, 1.0, 1.3), 0.2);

  s = s &&
    std.allEq(
      std.select(d.vec2i(-1, -2), d.vec2i(1, 2), true),
      d.vec2i(1, 2),
    );

  s = s &&
    std.allEq(
      std.select(
        d.vec4i(-1, -2, -3, -4),
        d.vec4i(1, 2, 3, 4),
        d.vec4b(true, true, false, false),
      ),
      d.vec4i(1, 2, -3, -4),
    );

  const vec = d.vec3b(true, false, true);
  s = s && std.allEq(std.not(vec), negate(vec));

  const inputStruct = Schema({
    vec2b: d.vec2b(false, true),
    vec4b: d.vec4b(false, true, false, true),
    vec3b: d.vec3b(true, true, false),
    bool: true,
  });

  const resultStruct = negateStruct(inputStruct);
  s = s && std.allEq(std.not(inputStruct.vec2b), resultStruct.vec2b);
  s = s && std.allEq(std.not(inputStruct.vec4b), resultStruct.vec4b);
  s = s && std.allEq(std.not(inputStruct.vec3b), resultStruct.vec3b);
  s = s && !inputStruct.bool === resultStruct.bool;

  return s;
});
