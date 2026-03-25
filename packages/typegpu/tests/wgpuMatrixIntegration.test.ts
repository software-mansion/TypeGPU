import { describe, expect, it } from 'vitest';
import * as m from 'wgpu-matrix';
import { mat3x3f, mat4x4f, matToArray, vec2f, vec3f, vec4f } from '../src/data/index.ts';

describe('mat4x4f', () => {
  it('can interact with wgpu-matrix library', () => {
    const mat = mat4x4f(
      vec4f(0, 1, 2, 3), // column 0
      vec4f(4, 5, 6, 7), // column 1
      vec4f(8, 9, 10, 11), // column 2
      vec4f(12, 13, 14, 15), // column 3
    );

    expect(m.mat4.equals(mat, mat)).toBe(true);

    expect(matToArray(mat)).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    m.mat4.identity(mat);
    expect(matToArray(mat)).toStrictEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('mat3x3f', () => {
  it('can interact with wgpu-matrix library', () => {
    const mat = mat3x3f(
      vec3f(0, 1, 2), // column 0
      vec3f(3, 4, 5), // column 1
      vec3f(6, 7, 8), // column 2
    );

    expect(m.mat3.equals(mat, mat)).toBe(true);

    expect(matToArray(mat)).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    m.mat3.identity(mat);
    expect(matToArray(mat)).toStrictEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('vec4f', () => {
  it('can interact with wgpu-matrix library', () => {
    const vec = vec4f(1, 2, 3, 4);

    expect(m.vec4.equals(vec, vec)).toBe(true);

    expect([vec.x, vec.y, vec.z, vec.w]).toStrictEqual([1, 2, 3, 4]);
    m.vec4.zero(vec);
    expect([vec.x, vec.y, vec.z, vec.w]).toStrictEqual([0, 0, 0, 0]);
  });
});

describe('vec3f', () => {
  it('can interact with wgpu-matrix library', () => {
    const vec = vec3f(1, 2, 3);

    expect(m.vec3.equals(vec, vec)).toBe(true);

    expect([vec.x, vec.y, vec.z]).toStrictEqual([1, 2, 3]);
    m.vec3.negate(vec, vec);
    expect([vec.x, vec.y, vec.z]).toStrictEqual([-1, -2, -3]);
  });
});

describe('vec2f', () => {
  it('can interact with wgpu-matrix library', () => {
    const vec = vec2f(1, 2);

    expect(m.vec2.equals(vec, vec)).toBe(true);

    expect([vec.x, vec.y]).toStrictEqual([1, 2]);
    m.vec2.negate(vec, vec);
    expect([vec.x, vec.y]).toStrictEqual([-1, -2]);
  });
});

describe('mat and vec interaction', () => {
  it('can transform a vector by a matrix', () => {
    const mat = mat4x4f(
      vec4f(4, 0, 0, 0), // column 0
      vec4f(0, 3, 0, 0), // column 1
      vec4f(0, 0, 2, 0), // column 2
      vec4f(0, 0, 0, 1), // column 3
    );

    const vec = vec4f(1, 2, 3, 4);
    m.vec4.transformMat4(vec, mat, vec);
    expect([vec.x, vec.y, vec.z, vec.w]).toStrictEqual([4, 6, 6, 4]);
  });

  it('can translate a matrix to look at a point', () => {
    const mat = mat4x4f(
      vec4f(0, 0, 0, 0), // column 0
      vec4f(0, 0, 0, 0), // column 1
      vec4f(0, 0, 0, 0), // column 2
      vec4f(0, 0, 0, 0), // column 3
    );

    const vec = vec3f(0, 0, 0);
    const up = vec3f(0, 0, 1);
    m.mat4.lookAt(mat, vec, up, mat);
    expect(matToArray(mat)).toStrictEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0, -0, -0, 1]);
  });
});
