import { describe, expect, it } from 'vitest';
import { mat4x4f, vec4f } from '../../../src/data/index.ts';
import tgpu from '../../../src/index.ts';
import { isCloseTo, mul, rotateX } from '../../../src/std/index.ts';
import { rotateY, rotateZ } from '../../../src/std/matrix.ts';
import { parse, parseResolved } from '../../utils/parseResolved.ts';

describe('rotate', () => {
  it('generates correct WGSL for rotateX with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu['~unstable']
      .fn([])(() => {
        const angle = 4;
        const resultExpression = rotateX(M, angle);
      }).$name('rotateX');

    expect(parseResolved({ rotateFn })).toBe(
      parse(
        `fn rotateX() {
          var angle = 4;
          var resultExpression = (
            mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1) *
            mat4x4f(1, 0, 0, 0, 0, cos(angle), sin(angle), 0, 0, -sin(angle), cos(angle), 0, 0, 0, 0, 1)
          );
        }`,
      ),
    );
  });

  it('generates correct WGSL for rotateY with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu['~unstable']
      .fn([])(() => {
        const angle = 4;
        const resultExpression = rotateY(M, angle);
      }).$name('rotateY');

    expect(parseResolved({ rotateFn })).toBe(
      parse(
        `fn rotateY() {
          var angle = 4;
          var resultExpression = (
            mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1) *
            mat4x4f(cos(angle), 0, -sin(angle), 0, 0, 1, 0, 0, sin(angle), 0, cos(angle), 0, 0, 0, 0, 1)
          );
        }`,
      ),
    );
  });

  it('generates correct WGSL for rotateZ with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu['~unstable']
      .fn([])(() => {
        const angle = 4;
        const resultExpression = rotateZ(M, angle);
      }).$name('rotateZ');

    expect(parseResolved({ rotateFn })).toBe(
      parse(
        `fn rotateZ() {
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
        mul(rotateX(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(1, -3, 2, 1),
      ),
    )
      .toBe(true);
  });

  it('rotates around Y correctly', () => {
    expect(
      isCloseTo(
        mul(rotateY(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(3, 2, -1, 1),
      ),
    )
      .toBe(true);
  });

  it('rotates around Z correctly', () => {
    expect(
      isCloseTo(
        mul(rotateZ(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(-2, 1, 3, 1),
      ),
    )
      .toBe(true);
  });
});
