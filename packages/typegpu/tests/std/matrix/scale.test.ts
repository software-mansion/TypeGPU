import { describe, expect, it } from 'vitest';
import { mat4x4f, vec3f, vec4f } from '../../../src/data/index.ts';
import tgpu from '../../../src/index.js';
import { isCloseTo, mul, scale4, translate4 } from '../../../src/std/index.ts';

describe('scale', () => {
  it('scales a matrix by a vec3f vector', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const T = vec3f(2, 3, 4);
    const result = scale4(M, T);
    expect(result).toEqual(mat4x4f(2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1));
  });

  it('generates correct WGSL for scale4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);
    const T = vec3f(2, 2, 4);

    const scaleFn = tgpu.fn([])(() => {
      const resultExpression = scale4(M, T);
    });

    expect(tgpu.resolve([scaleFn])).toMatchInlineSnapshot(`
      "fn scaleFn() {
        var resultExpression = mat4x4f(2, 0, 0, 1, 0, 2, 0, 0, 2, 0, 4, 0, 0, 2, 0, 1);
      }"
    `);
  });

  it('scales correctly', () => {
    const result = scale4(mat4x4f.identity(), vec3f(3, 4, 5));
    expect(isCloseTo(mul(result, vec4f(1, 2, 3, 1)), vec4f(3, 8, 15, 1))).toBe(true);
  });

  it('applies order correctly', () => {
    let transformation = mat4x4f.identity();
    transformation = translate4(transformation, vec3f(0, 1, 0));
    transformation = scale4(transformation, vec3f(2, 3, 4));
    expect(isCloseTo(mul(transformation, vec4f(0, 0, 0, 1)), vec4f(0, 3, 0, 1))).toBe(true);
  });
});
