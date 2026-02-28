import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4h } from '../../../src/data/index.ts';
import { pow } from '../../../src/std/index.ts';

describe('pow', () => {
  it('should return the correct power', () => {
    expect(pow(2, 3)).toBe(8);
  });

  it('should return the correct power for vectors', () => {
    expect(pow(vec2f(2, 3), vec2f(4, 5))).toStrictEqual(vec2f(16, 243));
  });

  it('should handle exponent zero for scalars', () => {
    expect(pow(5, 0)).toBe(1);
  });

  it('should handle exponent one for scalars', () => {
    expect(pow(7, 1)).toBe(7);
  });

  it('should return correct power for vec3f with mixed exponents', () => {
    expect(pow(vec3f(2, 3, 4), vec3f(2, 3, 0))).toStrictEqual(vec3f(4, 27, 1));
  });

  it('should return correct power for float vectors with non integer values', () => {
    expect(pow(vec3f(2, 3.3, 4), vec3f(2.5, 3.5, 0.5))).toStrictEqual(
      vec3f(2 ** 2.5, 3.3 ** 3.5, 4 ** 0.5),
    );
  });

  it('should return correct power for half precision vectors', () => {
    expect(pow(vec4h(2, 3, 4, 5), vec4h(2, 3, 0, 1))).toStrictEqual(vec4h(4, 27, 1, 5));
  });
});
