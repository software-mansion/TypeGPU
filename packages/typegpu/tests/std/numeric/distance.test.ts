import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';
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
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3h'.]`,
    );
    // @ts-expect-error
    expect(() => distance(vec2f(0, 0), 0)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, number'.]`,
    );
    // @ts-expect-error
    expect(() => distance(vec2f(), vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f'.]`,
    );
  });

  it('explains when arguments have no common type on the GPU', () => {
    const mixedPrecision = () => {
      'use gpu';
      // @ts-expect-error
      return distance(d.vec3f(1, 2, 3), d.vec3h(1, 2, 3));
    };

    expect(() => tgpu.resolve([mixedPrecision])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:mixedPrecision
      - fn*:mixedPrecision()
      - fn:distance: Data types vec3f, vec3h cannot be used together, because they have no common type. Convert them explicitly to the same type. Supported types are: f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.]
    `);
  });
});
