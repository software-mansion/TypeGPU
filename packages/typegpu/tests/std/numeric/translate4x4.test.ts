import { describe, expect, it } from 'vitest';
import { mul, translate4x4 } from '../../../src/std/index.ts';
import { mat4x4f, vec3f } from '../../../src/data/index.ts';
import { parse, parseResolved } from '../../utils/parseResolved.ts';
import tgpu from '../../../src/index.ts';

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

  it('generates correct WGSL for translate4x4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);
    const T = vec3f(2, 2, 4);

    const translateFn = tgpu['~unstable']
      .fn([])(() => {
        const resultExpression = translate4x4(M, T);
      }).$name('translate4x4');

    expect(parseResolved({ translateFn })).toBe(
      parse(
        `fn translate4x4() { 
          var resultExpression = (mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(2, 2, 4).x, vec3f(2, 2, 4).y, vec3f(2, 2, 4).z, 1)); 
        }`,
      ),
    );
  });

  it('generates correct WGSL for translate4x4 with negative translation values', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const T = vec3f(-2.5, -3.75, -10);

    const translateFn = tgpu['~unstable']
      .fn([])(() => {
        const resultExpression = translate4x4(M, T);
      }).$name('translateNegative');

    expect(parseResolved({ translateFn })).toBe(
      parse(
        `fn translateNegative() { 
          var resultExpression = (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-2.5, -3.75, -10).x, vec3f(-2.5, -3.75, -10).y, vec3f(-2.5, -3.75, -10).z, 1)); 
        }`,
      ),
    );
  });

  it('generates correct WGSL for translate4x4 with zero translation (identity case)', () => {
    const M = mat4x4f(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 5, 5, 1);
    const T = vec3f(0, 0, 0);

    const translateFn = tgpu['~unstable']
      .fn([])(() => {
        const resultExpression = translate4x4(M, T);
      }).$name('translateZero');

    expect(parseResolved({ translateFn })).toBe(
      parse(
        `fn translateZero() { 
          var resultExpression = (mat4x4f(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 5, 5, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 0, 0).x, vec3f(0, 0, 0).y, vec3f(0, 0, 0).z, 1)); 
        }`,
      ),
    );
  });

  it('generates correct WGSL for translate4x4 with large numbers', () => {
    const M = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 10, 10, 1);
    const T = vec3f(999.99, 8888.88, 77777.77);

    const translateFn = tgpu['~unstable']
      .fn([])(() => {
        const resultExpression = translate4x4(M, T);
      }).$name('translateLarge');

    expect(parseResolved({ translateFn })).toBe(
      parse(
        `fn translateLarge() { 
          var resultExpression = (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 10, 10, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(999.99, 8888.88, 77777.77).x, vec3f(999.99, 8888.88, 77777.77).y, vec3f(999.99, 8888.88, 77777.77).z, 1)); 
        }`,
      ),
    );
  });

  it('generates correct WGSL for nested translate4x4 within multiplication', () => {
    const M1 = mat4x4f(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1);
    const M2 = mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 5, 5, 1);
    const T = vec3f(1, 2, 3);

    const translateFn = tgpu['~unstable']
      .fn([])(() => {
        const resultExpression = mul(M1, translate4x4(M2, T));
      }).$name('nestedTranslate');

    expect(parseResolved({ translateFn })).toBe(
      parse(
        `fn nestedTranslate() { 
          var resultExpression =(mat4x4f(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 5, 5, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(1, 2, 3).x, vec3f(1, 2, 3).y, vec3f(1, 2, 3).z, 1))); 
        }`,
      ),
    );
  });
});
