import { describe, expect, it } from 'vitest';
import { mat4x4f, vec4f } from '../../../src/data/index.ts';
import tgpu from '../../../src/index.ts';
import { isCloseTo, mul } from '../../../src/std/index.ts';
import { rotateX4, rotateY4, rotateZ4 } from '../../../src/std/matrix.ts';
import { parse, parseResolved } from '../../utils/parseResolved.ts';

describe('rotate', () => {
  it('generates correct WGSL for rotateX4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu['~unstable']
      .fn([])(() => {
        const angle = 4;
        const resultExpression = rotateX4(M, angle);
      }).$name('rotateX4');

    expect(parseResolved({ rotateFn })).toBe(
      parse(
        `fn rotateX4() {
          var angle = 4;
          var resultExpression = (
            mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1) *
            mat4x4f(1, 0, 0, 0, 0, cos(angle), sin(angle), 0, 0, -sin(angle), cos(angle), 0, 0, 0, 0, 1)
          );
        }`,
      ),
    );
  });

  it('generates correct WGSL for rotateY4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu['~unstable']
      .fn([])(() => {
        const angle = 4;
        const resultExpression = rotateY4(M, angle);
      }).$name('rotateY4');

    expect(parseResolved({ rotateFn })).toBe(
      parse(
        `fn rotateY4() {
          var angle = 4;
          var resultExpression = (
            mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1) *
            mat4x4f(cos(angle), 0, -sin(angle), 0, 0, 1, 0, 0, sin(angle), 0, cos(angle), 0, 0, 0, 0, 1)
          );
        }`,
      ),
    );
  });

  it('generates correct WGSL for rotateZ4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu['~unstable']
      .fn([])(() => {
        const angle = 4;
        const resultExpression = rotateZ4(M, angle);
      }).$name('rotateZ4');

    expect(parseResolved({ rotateFn })).toBe(
      parse(
        `fn rotateZ4() {
          var angle = 4;
          var resultExpression = (
            mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1) *
            mat4x4f(cos(angle), sin(angle), 0, 0, -sin(angle), cos(angle), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
          );
        }`,
      ),
    );
  });

  it('rotates around X correctly', () => {
    expect(
      isCloseTo(
        mul(rotateX4(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(1, -3, 2, 1),
      ),
    )
      .toBe(true);
  });

  it('rotates around Y correctly', () => {
    expect(
      isCloseTo(
        mul(rotateY4(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(3, 2, -1, 1),
      ),
    )
      .toBe(true);
  });

  it('rotates around Z correctly', () => {
    expect(
      isCloseTo(
        mul(rotateZ4(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(-2, 1, 3, 1),
      ),
    )
      .toBe(true);
  });
});
