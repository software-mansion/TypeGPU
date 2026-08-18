import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec3h } from 'typegpu/data';
import { distance } from 'typegpu/std';

describe('distance', () => {
  it('computes distance between two points', () => {
    expect(distance(vec2f(0, 0), vec2f(0, 0))).toBeCloseTo(0);
    expect(distance(vec2f(0, 0), vec2f(1, 0))).toBeCloseTo(1);
    expect(distance(vec2f(0, 0), vec2f(0, 1))).toBeCloseTo(1);
    expect(distance(vec2f(0, 0), vec2f(1, 1))).toBeCloseTo(Math.sqrt(2));

    expect(distance(vec3h(0, 0, 0), vec3h(0, 0, 0))).toBeCloseTo(0);
    expect(distance(vec3h(0, 0, 0), vec3h(1, 0, 0))).toBeCloseTo(1);
    expect(distance(vec3h(0, 0, 0), vec3h(0, 1, 0))).toBeCloseTo(1);
    expect(distance(vec3h(0, 0, 0), vec3h(0, 0, 1))).toBeCloseTo(1);
    expect(distance(vec3h(0, 0, 0), vec3h(1, 1, 1))).toBeCloseTo(Math.sqrt(3));

    expect(distance(0, 2)).toBeCloseTo(2);
    expect(distance(-233, 87)).toBeCloseTo(320);
  });

  it('does not accept different types', () => {
    // @ts-expect-error
    expect(() => distance(vec2f(0, 0), vec3h(0, 0, 0))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3h']`,
    );
    // @ts-expect-error
    expect(() => distance(vec2f(0, 0), 0)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, number']`,
    );
    // @ts-expect-error
    expect(() => distance(vec2f(), vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f']`,
    );
  });
});
