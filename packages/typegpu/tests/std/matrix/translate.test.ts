import { describe, expect, it } from 'vitest';
import { mat4x4f, vec3f, vec4f } from '../../../src/data/index.ts';
import tgpu from '../../../src/index.js';
import { isCloseTo, mul, scale4, translate4 } from '../../../src/std/index.ts';

describe('translate', () => {
  it('translates a matrix by a vec3f vector', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const T = vec3f(2, 3, 4);
    const result = translate4(M, T);
    expect(result).toEqual(mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1));
  });

  it('generates correct WGSL for translate4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);
    const T = vec3f(2, 2, 4);

    const translateFn = tgpu.fn([])(() => {
      const resultExpression = translate4(M, T);
    });

    expect(tgpu.resolve([translateFn])).toMatchInlineSnapshot(`
      "fn translateFn() {
        var resultExpression = mat4x4f(3, 2, 4, 1, 0, 1, 0, 0, 1, 0, 1, 0, 2, 3, 4, 1);
      }"
    `);
  });

  it('translates correctly', () => {
    const result = translate4(mat4x4f.identity(), vec3f(3, 4, 5));
    expect(isCloseTo(mul(result, vec4f(1, 2, 3, 1)), vec4f(4, 6, 8, 1))).toBe(true);
  });

  it('applies order correctly', () => {
    let transformation = mat4x4f.identity();
    transformation = scale4(transformation, vec3f(2, 3, 4));
    transformation = translate4(transformation, vec3f(0, 1, 0));
    expect(isCloseTo(mul(transformation, vec4f(1, 0, 0, 1)), vec4f(2, 1, 0, 1))).toBe(true);
  });
});
