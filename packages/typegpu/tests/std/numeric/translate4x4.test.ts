import { describe, expect, it } from 'vitest';
import { translate4x4 } from '../../../src/std/index.ts';
import { mat4x4f, vec3f } from '../../../src/data/index.ts';
import { parseResolved } from '../../utils/parseResolved.ts';

describe('translate', () => {
  it('translates a matrix by a vec3f vector', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const T = vec3f(1, 2, 3);
    const result = translate4x4(M, T);
    expect(result).toEqual(
      mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1),
    );
  });

  it('translates a matrix by a vec3f vector', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);
    const T = vec3f(2, 2, 4);
    const result = translate4x4(M, T);
    expect(result).toEqual(
      mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 6, 3, 4, 3),
    );
  });

  it('generates correct WGSL for translate4x4 with identity matrix', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const T = vec3f(1, 2, 3);
    const resultExpression = translate4x4(M, T);
    const wgsl = parseResolved({ resultExpression });
    expect(wgsl).toMatchSnapshot();
  });

  it('generates correct WGSL for translate4x4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);
    const T = vec3f(2, 2, 4);
    const resultExpression = translate4x4(M, T);
    const wgsl = parseResolved({ resultExpression });
    expect(wgsl).toMatchSnapshot();
  });
});
