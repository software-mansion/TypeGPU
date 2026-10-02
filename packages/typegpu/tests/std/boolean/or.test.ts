import { describe, expect, it } from 'vitest';
import { vec2b, vec2f, vec3b, vec4b } from 'typegpu/data';
import { or } from 'typegpu/std';

describe('or', () => {
  it('ors vectors', () => {
    expect(or(vec2b(false, false), vec2b(true, false))).toStrictEqual(vec2b(true, false));
    expect(or(vec3b(false, true, false), vec3b(true, false, false))).toStrictEqual(
      vec3b(true, true, false),
    );
    expect(or(vec4b(false, true, false, true), vec4b(false, false, true, true))).toStrictEqual(
      vec4b(false, true, true, true),
    );
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => or(vec2b(), vec3b())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2<bool>, vec3<bool>'.]`,
    );
    // @ts-expect-error
    expect(() => or(vec2f(1, 0), vec2f(0, 0))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'boolean, vec2<bool>, vec3<bool>, vec4<bool>', got 'vec2f'.]`,
    );
  });
});
