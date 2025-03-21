import tgpu from 'typegpu';
import {
  bool,
  struct,
  vec2b,
  vec2i,
  vec3b,
  vec3f,
  vec3i,
  vec4b,
  vec4i,
} from 'typegpu/data';
import {
  all,
  allEq,
  and,
  any,
  eq,
  greaterThan,
  greaterThanOrEqual,
  isCloseTo,
  lessThan,
  lessThanOrEqual,
  neq,
  not,
  or,
  select,
} from 'typegpu/std';

const Schema = struct({
  vec2b,
  vec4b,
  vec3b,
  bool,
});

const negate = tgpu['~unstable'].fn([Schema], Schema).does((input) => {
  const result = Schema({
    vec2b: not(input.vec2b),
    vec4b: not(input.vec4b),
    vec3b: not(input.vec3b),
    bool: !input.bool,
  });
  return result;
});

// TODO: replace `s = s &&` with `s &&=` when implemented
export const booleanTests = tgpu['~unstable'].fn([], bool).does(() => {
  let s = true;

  s = s && eq(vec2i(1, 3), vec2i(1, 3)).x === true;
  s = s && eq(vec2i(1, 3), vec2i(1, 3)).y === true;
  s = s && eq(vec2i(1, 3), vec2i(1, 2)).x === true;
  s = s && eq(vec2i(1, 3), vec2i(1, 2)).y === false;

  s = s && all(vec4b(true, true, true, true));
  s = s && !all(vec4b(true, false, true, true));

  s = s && any(vec4b(false, false, true, false));
  s = s && !any(vec4b(false, false, false, false));

  s = s && allEq(vec2i(1, 3), vec2i(1, 3));
  s = s && !allEq(vec2i(1, 3), vec2i(1, 2));

  s =
    s && allEq(neq(vec3i(1, 2, 3), vec3i(1, 2, 4)), vec3b(false, false, true));

  s =
    s &&
    allEq(
      lessThan(vec3f(1.0, -1.0, 0.0), vec3f(1.0, 1.0, -1.0)),
      vec3b(false, true, false),
    );

  s =
    s &&
    allEq(
      lessThanOrEqual(vec3f(1.0, -1.0, 0.0), vec3f(1.0, 1.0, -1.0)),
      vec3b(true, true, false),
    );

  s =
    s &&
    allEq(
      greaterThan(vec3f(1.0, -1.0, 0.0), vec3f(1.0, 1.0, -1.0)),
      vec3b(false, false, true),
    );

  s =
    s &&
    allEq(
      greaterThanOrEqual(vec3f(1.0, -1.0, 0.0), vec3f(1.0, 1.0, -1.0)),
      vec3b(true, false, true),
    );

  s = s && allEq(not(vec2b(false, true)), vec2b(true, false));

  s =
    s &&
    allEq(
      or(vec4b(true, true, false, false), vec4b(true, false, true, false)),
      vec4b(true, true, true, false),
    );

  s =
    s &&
    allEq(
      and(vec4b(true, true, false, false), vec4b(true, false, true, false)),
      vec4b(true, false, false, false),
    );

  s = s && isCloseTo(vec3f(1.0, 1.0, 1.0), vec3f(0.999, 1.0, 1.001));
  s = s && !isCloseTo(vec3f(1.0, 1.0, 1.0), vec3f(0.9, 1.0, 1.1));
  s = s && isCloseTo(vec3f(1.0, 1.0, 1.0), vec3f(0.9, 1.0, 1.1), 0.2);
  s = s && !isCloseTo(vec3f(1.0, 1.0, 1.0), vec3f(0.7, 1.0, 1.3), 0.2);

  s = s && allEq(select(vec2i(-1, -2), vec2i(1, 2), true), vec2i(1, 2));

  s =
    s &&
    allEq(
      select(
        vec4i(-1, -2, -3, -4),
        vec4i(1, 2, 3, 4),
        vec4b(true, true, false, false),
      ),
      vec4i(1, 2, -3, -4),
    );

  const struct = Schema({
    vec2b: vec2b(false, true),
    vec4b: vec4b(false, true, false, true),
    vec3b: vec3b(true, true, false),
    bool: true,
  });

  const negStruct = Schema({
    vec2b: vec2b(true, false),
    vec4b: vec4b(true, false, true, false),
    vec3b: vec3b(false, false, true),
    bool: false,
  });

  const result = negate(struct);

  s = s && allEq(negStruct.vec2b, result.vec2b);
  s = s && allEq(negStruct.vec4b, result.vec4b);
  s = s && allEq(negStruct.vec3b, result.vec3b);
  s = s && negStruct.bool === result.bool;

  return s;
});

console.log(tgpu.resolve({ externals: { booleanTests } }));
