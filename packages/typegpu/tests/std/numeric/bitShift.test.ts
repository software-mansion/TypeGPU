import { describe, expect, it, vi } from 'vitest';
import { u32, i32, vec3f, vec3i, vec3u, f32, vec2u } from '../../../src/data/index.ts';
import { bitShiftLeft, bitShiftRight } from '../../../src/std/index.ts';
import tgpu from '../../../src/index.js';

describe('bit shift', () => {
  it('casts rhs to u32', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      return x << 4;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const x = 256i;
        return (x << 4u);
      }"
    `);
  });

  it('does not cast rhs to i32 (no call to convertToCommonType)', () => {
    const f = () => {
      'use gpu';
      const shift = u32(4);
      const x = i32(256);
      return x << shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const shift = 4u;
        const x = 256i;
        return (x << shift);
      }"
    `);
  });

  it('casts float rhs to u32', () => {
    const f = () => {
      'use gpu';
      const shift = f32(4);
      const x = i32(256);
      return x << shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const shift = 4f;
        const x = 256i;
        return (x << u32(shift));
      }"
    `);
  });

  it('works with vectors via std functions', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      const y = bitShiftLeft(x, shift);
      const z = bitShiftRight(x, shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var shift = vec3u(4);
        var x = vec3i(256);
        var y = (x << shift);
        var z = (x >> shift);
      }"
    `);
  });

  it('works with vectors via infix methods', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      const y = x.bitShiftLeft(shift);
      const z = x.bitShiftRight(shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var shift = vec3u(4);
        var x = vec3i(256);
        var y = (x << shift);
        var z = (x >> shift);
      }"
    `);
  });

  it('works with vector lhs and numeric rhs via infix/std methods', () => {
    const f = () => {
      'use gpu';
      const shift = u32(4);
      const x = vec3i(256);
      const y = x.bitShiftLeft(shift);
      const z = x.bitShiftRight(shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const shift = 4u;
        var x = vec3i(256);
        var y = (x << vec3u(shift));
        var z = (x >> vec3u(shift));
      }"
    `);
  });

  it('>>= works with numerics', () => {
    const f = () => {
      'use gpu';
      const shift = u32(4);
      let x = i32(256);
      x >>= shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const shift = 4u;
        var x = 256i;
        x >>= shift;
      }"
    `);
  });

  it('<< works with vectors', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      // @ts-expect-error: part of the test
      return x << shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> vec3i {
        var shift = vec3u(4);
        var x = vec3i(256);
        return (x << shift);
      }"
    `);
  });

  it('>>= works with vectors', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      let x = vec3i(256);
      // @ts-expect-error: part of the test
      x >>= shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var shift = vec3u(4);
        var x = vec3i(256);
        x >>= shift;
      }"
    `);
  });

  it('computes correct values for number << number', () => {
    expect(bitShiftLeft(1, 4)).toBe(16);
    expect(bitShiftRight(256, 4)).toBe(16);
  });

  it('computes correct values for vector << vector', () => {
    const result1 = bitShiftLeft(vec3i(1, 2, 3), vec3u(1, 2, 3));
    expect(Array.from(result1)).toStrictEqual([2, 8, 24]);

    const result2 = bitShiftRight(vec3i(16, 32, 64), vec3u(1, 2, 3));
    expect(Array.from(result2)).toStrictEqual([8, 8, 8]);
  });

  it('computes correct values for vector << number', () => {
    const result1 = bitShiftLeft(vec3i(1, 2, 3), 2);
    expect(Array.from(result1)).toStrictEqual([4, 8, 12]);

    const result2 = bitShiftRight(vec3i(16, 32, 64), 2);
    expect(Array.from(result2)).toStrictEqual([4, 8, 16]);
  });

  it('throws when calling bitShiftLeft/Right on float vectors', () => {
    const x = vec3f(1, 2, 3);
    // @ts-expect-error: part of the test
    expect(() => bitShiftLeft(x, vec3u(1, 2, 3))).toThrowErrorMatchingInlineSnapshot(
      `[Error: bitShiftLeft called with invalid arguments, expected types: number or integer vector (rhs must be the same arity as lhs).]`,
    );
    // @ts-expect-error: part of the test
    expect(() => bitShiftRight(x, vec3u(1, 2, 3))).toThrowErrorMatchingInlineSnapshot(
      `[Error: bitShiftRight called with invalid arguments, expected types: number or integer vector (rhs must be the same arity as lhs).]`,
    );
  });

  it('throws when calling bitShiftLeft/Right with vectors of different arity', () => {
    const x = vec3i(1, 2, 3);
    //@ts-expect-error: part of the test
    expect(() => bitShiftLeft(x, vec2u(1))).toThrowErrorMatchingInlineSnapshot(
      `[Error: bitShiftLeft called with invalid arguments, expected types: number or integer vector (rhs must be the same arity as lhs).]`,
    );

    const f = () => {
      'use gpu';
      const shift = vec2u(4);
      let x = vec3i(256);
      // @ts-expect-error: part of the test
      x.bitShiftLeft(shift);
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Unsupported data types: vec2u. Supported types are: u32, vec3u.]
    `);
  });

  it('throws when using raw <<  with vectors of different arity', () => {
    const f = () => {
      'use gpu';
      const shift = vec2u(4);
      let x = vec3i(256);
      // @ts-expect-error: part of the test
      x << shift;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Cannot convert value of type 'vec2u' to any of the target types: [vec3u]]
    `);
  });

  it('bitShiftLeft/Right is available only on integer vectors (at type level)', () => {
    const x = vec3f(1, 2, 3);
    // @ts-expect-error: part of the test
    x.bitShiftLeft;
    // @ts-expect-error: part of the test
    x.bitShiftRight;

    const y = vec3i(1, 2, 3);
    y.bitShiftLeft(2);
  });
});
