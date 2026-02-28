import { describe, expect, it } from 'vitest';
import { mat4x4f, vec4f } from '../../../src/data/index.ts';
import tgpu from '../../../src/index.js';
import { isCloseTo, mul } from '../../../src/std/index.ts';
import { rotateX4, rotateY4, rotateZ4 } from '../../../src/std/matrix.ts';

describe('rotate', () => {
  it('generates correct WGSL for rotateX4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu.fn([])(() => {
      const angle = 4;
      const resultExpression = rotateX4(M, angle);
    });

    expect(tgpu.resolve([rotateFn])).toMatchInlineSnapshot(`
      "fn rotateFn() {
        const angle = 4;
        var resultExpression = (mat4x4f(1, 0, 0, 0, 0, cos(f32(angle)), sin(f32(angle)), 0, 0, -sin(f32(angle)), cos(f32(angle)), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1));
      }"
    `);
  });

  it('generates correct WGSL for rotateY4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu.fn([])(() => {
      const angle = 4;
      const resultExpression = rotateY4(M, angle);
    });

    expect(tgpu.resolve([rotateFn])).toMatchInlineSnapshot(`
      "fn rotateFn() {
        const angle = 4;
        var resultExpression = (mat4x4f(cos(f32(angle)), 0, -sin(f32(angle)), 0, 0, 1, 0, 0, sin(f32(angle)), 0, cos(f32(angle)), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1));
      }"
    `);
  });

  it('generates correct WGSL for rotateZ4 with custom matrix', () => {
    const M = mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1);

    const rotateFn = tgpu.fn([])(() => {
      const angle = 4;
      const resultExpression = rotateZ4(M, angle);
    });

    expect(tgpu.resolve([rotateFn])).toMatchInlineSnapshot(`
      "fn rotateFn() {
        const angle = 4;
        var resultExpression = (mat4x4f(cos(f32(angle)), sin(f32(angle)), 0, 0, -sin(f32(angle)), cos(f32(angle)), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1));
      }"
    `);
  });

  it('rotates around X correctly', () => {
    expect(
      isCloseTo(
        mul(rotateX4(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(1, -3, 2, 1),
      ),
    ).toBe(true);
  });

  it('rotates around Y correctly', () => {
    expect(
      isCloseTo(
        mul(rotateY4(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(3, 2, -1, 1),
      ),
    ).toBe(true);
  });

  it('rotates around Z correctly', () => {
    expect(
      isCloseTo(
        mul(rotateZ4(mat4x4f.identity(), Math.PI / 2), vec4f(1, 2, 3, 1)),
        vec4f(-2, 1, 3, 1),
      ),
    ).toBe(true);
  });

  it('applies order correctly', () => {
    let transformation1 = mat4x4f.identity();
    transformation1 = rotateX4(transformation1, Math.PI / 2);
    transformation1 = rotateZ4(transformation1, Math.PI / 2);
    expect(isCloseTo(mul(transformation1, vec4f(1, 0, 0, 1)), vec4f(0, 1, 0, 1))).toBe(true);

    let transformation2 = mat4x4f.identity();
    transformation2 = rotateZ4(transformation2, Math.PI / 2);
    transformation2 = rotateX4(transformation2, Math.PI / 2);
    expect(isCloseTo(mul(transformation2, vec4f(1, 0, 0, 1)), vec4f(0, 0, 1, 1))).toBe(true);
  });

  it('applies order correctly', () => {
    let transformation1 = mat4x4f.identity();
    transformation1 = rotateY4(transformation1, Math.PI / 2);
    transformation1 = rotateZ4(transformation1, Math.PI / 2);
    expect(isCloseTo(mul(transformation1, vec4f(0, 1, 0, 1)), vec4f(-1, 0, 0, 1))).toBe(true);
  });
});
