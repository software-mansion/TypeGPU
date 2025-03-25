import { vec3f } from '../../src/data';
import { mat4x4f } from '../../src/data/matrix';
import { translate } from '../../src/std';
import { describe, expect, it } from 'vitest';

describe('translate', () => {
  it('translates a matrix by a vec2f vector', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const T = vec3f(1, 2, 3);
    const result = translate(M, T);
    expect(result).toEqual([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [1, 2, 3, 1],
    ]);
  });

  it('translates a matrix by a vec3f vector', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const T = vec3f(1, 2, 3);
    const result = translate(M, T);
    expect(result).toEqual([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [1, 2, 3, 1],
    ]);
  });

  it('translates a matrix by a vec4f vector', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const T = vec3f(1, 2, 3);
    const result = translate(M, T);
    expect(result).toEqual([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [1, 2, 3, 1],
    ]);
  });
});
