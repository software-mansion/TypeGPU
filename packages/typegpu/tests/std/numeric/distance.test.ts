import { describe, expect, it } from 'vitest';
import { vec2f, vec3h } from '../../../src/data';
import { distance } from '../../../src/std';

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
    distance(vec2f(0, 0), vec3h(0, 0, 0));
    // @ts-expect-error
    distance(vec2f(0, 0), 0);
  });
});
