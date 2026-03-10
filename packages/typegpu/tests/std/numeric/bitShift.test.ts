import { describe, expect, it, vi } from 'vitest';
import { u32, i32, vec3f, vec3i, vec3u, f32 } from '../../../src/data/index.ts';
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
        var y = (x << shift);
        var z = (x >> shift);
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
      // @ts-expect-error
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

  it('bitShiftLeft/Right is available only on integer vectors', () => {
    const x = vec3f(1, 2, 3);
    // @ts-expect-error
    x.bitShiftLeft;
    // @ts-expect-error
    x.bitShiftRight;

    const y = vec3i(1, 2, 3);
    y.bitShiftLeft(2);
  });

  it('>>= works with vectors', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      let x = vec3i(256);
      // @ts-expect-error
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
});
