import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from 'typegpu/data';
import { atan2, isCloseTo } from 'typegpu/std';

describe('atan2', () => {
  it('computes atan2 of two values', () => {
    expect(atan2(0, 1)).toBeCloseTo(0);
    expect(atan2(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(atan2(0, -1)).toBeCloseTo(Math.PI);
    expect(atan2(-1, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('computes atan2 for two vectors', () => {
    expect(
      isCloseTo(
        atan2(vec4f(0, 1, 0, -1), vec4f(1, 0, -1, 0)),
        vec4f(0, Math.PI / 2, Math.PI, -Math.PI / 2),
      ),
    ).toBe(true);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => atan2(vec2f(), vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f']`,
    );
  });
});
