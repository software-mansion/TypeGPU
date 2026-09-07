import { describe, expect, it, vi } from 'vitest';
import { u32, i32, vec3f, vec3i, vec3u, f32, vec2u } from 'typegpu/data';
import { bitShiftLeft, bitShiftRight } from 'typegpu/std';
import { tgpu } from 'typegpu';

describe('bit shift', () => {
  it('casts abstract type rhs to u32', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      return (x << 4) | (x >> 4);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const x = 256i;
        return ((x << 4u) | (x >> 4u));
      }"
    `);
  });

  it('casts f32 rhs to u32', () => {
    const f = () => {
      'use gpu';
      const shift = f32(4);
      const x = i32(256);
      return (x << shift) | (x >> shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const shift = 4f;
        const x = 256i;
        return ((x << u32(shift)) | (x >> u32(shift)));
      }"
    `);
  });

  it('throws when lhs is not an integer', () => {
    const f = () => {
      'use gpu';
      const x = f32(256);
      return x << 4;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Expression: x << 4
      Left-hand side of '<<' must be an integer or vector of integers.
      Got f32.]
    `);
  });

  it('throws when lhs is not an integer vector', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(7);
      const x = vec3f(256);
      // @ts-ignore
      return x >> shift;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Expression: x >> shift
      Left-hand side of '>>' must be an integer or vector of integers.
      Got vec3f.]
    `);
  });

  it('throws when using vectors of different arity', () => {
    const f = () => {
      'use gpu';
      const shift = vec2u(4);
      const x = vec3i(256);
      // @ts-expect-error: part of the test
      return x << shift;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Cannot convert value of type 'vec2u' to any of the target types: [vec3u]]
    `);
  });
});

describe('bit shifts << and <<=', () => {
  it('works with i32 and u32 lhs', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      const y = u32(256);
      return (x << 4) | (y << 4);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const x = 256i;
        const y = 256u;
        return ((x << 4u) | i32((y << 4u)));
      }"
    `);
  });

  it('works with integer vectors', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      const y = vec3u(256);
      // @ts-ignore
      const _z = x << shift;
      // @ts-ignore
      const _w = y << shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3i(256);
        let y = vec3u(256);
        let _z = (x << shift);
        let _w = (y << shift);
      }"
    `);
  });

  it('generates correct wgsl for <<=', () => {
    const f = () => {
      'use gpu';
      let x = u32(8);
      x <<= 4;
    };
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var x = 8u;
        x <<= 4u;
      }"
    `);
  });
});

describe('bit shift >> and >>=', () => {
  it('works with i32 lhs', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      return x >> 4;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const x = 256i;
        return (x >> 4u);
      }"
    `);
  });

  it('warns when lhs is u32', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = () => {
      'use gpu';
      const x = u32(256);
      return x >> 4;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> u32 {
        const x = 256u;
        return (x >> 4u);
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [deprecated] ",
        "
      Expression: x >> 4
      Using u32 or vecN<u32> as left-hand side of >> is deprecated.
      Use >>> instead.",
      ]
    `);
  });

  it('works with i32 vector', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      // @ts-ignore
      const _z = x >> shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3i(256);
        let _z = (x >> shift);
      }"
    `);
  });

  it('warns when lhs is u32 vector', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3u(256);
      // @ts-ignore
      const _z = x >> shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3u(256);
        let _z = (x >> shift);
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [deprecated] ",
        "
      Expression: x >> shift
      Using u32 or vecN<u32> as left-hand side of >> is deprecated.
      Use >>> instead.",
      ]
    `);
  });

  it('generates correct wgsl for >>=', () => {
    const f = () => {
      'use gpu';
      let x = i32(8);
      x >>= 4;
    };
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var x = 8i;
        x >>= 4u;
      }"
    `);
  });
});

describe('bit shift >>> and >>>=', () => {
  it('works with u32 lhs', () => {
    const f = () => {
      'use gpu';
      const x = u32(256);
      return x >>> 4;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> u32 {
        const x = 256u;
        return (x >> 4u);
      }"
    `);
  });

  it('throws when lhs is i32', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      return x >>> 4;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Expression: x >>> 4
      Left-hand side of '>>>' must be an unsigned integer or vector of unsigned integers.
      Got i32.
      Use >> instead.]
    `);
  });

  it('works with u32 vectors', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3u(256);
      // @ts-ignore
      const _z = x >>> shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3u(256);
        let _z = (x >> shift);
      }"
    `);
  });

  it('throws when lhs is i32 vector', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      // @ts-ignore
      const _z = x >>> shift;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Expression: x >>> shift
      Left-hand side of '>>>' must be an unsigned integer or vector of unsigned integers.
      Got vec3i.
      Use >> instead.]
    `);
  });

  it('generates correct wgsl for >>>=', () => {
    const f = () => {
      'use gpu';
      let x = u32(8);
      x >>>= 4;
    };
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var x = 8u;
        x >>= 4u;
      }"
    `);
  });
});

describe('std.bitShift', () => {
  it('throws in JS when lhs is a number', () => {
    // @ts-expect-error
    expect(() => bitShiftLeft(2, 1)).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftLeft' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );

    // @ts-expect-error
    expect(() => bitShiftRight(2, 1)).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );
  });

  it('computes values that match WGSL behavior', () => {
    const result1 = bitShiftLeft(vec3i(1, 2, 3), vec3u(1, 2, 3));
    expect(Array.from(result1)).toStrictEqual([2, 8, 24]);

    const result2 = bitShiftRight(vec3u(0x80000001), vec3u(1, 2, 3));
    expect(Array.from(result2)).toStrictEqual([1073741824, 536870912, 268435456]);

    const result3 = bitShiftRight(vec3i(0x80000001), vec3u(1, 2, 3));
    expect(Array.from(result3)).toStrictEqual([-1073741824, -536870912, -268435456]);
  });

  it('throws during WGSL generation when lhs is a number', () => {
    const f1 = () => {
      'use gpu';
      const x = 256;
      // @ts-expect-error
      bitShiftLeft(x, 1);
    };
    expect(() => tgpu.resolve([f1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f1
      - fn*:f1()
      - fn:bitShiftLeft: Unsupported data types: i32. Supported types are: vec2i, vec3i, vec4i, vec2u, vec3u, vec4u.]
    `);

    const f2 = () => {
      'use gpu';
      const x = 256;
      // @ts-expect-error
      bitShiftRight(x, 1);
    };
    expect(() => tgpu.resolve([f2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f2
      - fn*:f2()
      - fn:bitShiftRight: Unsupported data types: i32. Supported types are: vec2i, vec3i, vec4i, vec2u, vec3u, vec4u.]
    `);
  });

  it('generates correct wgsl for vector operands', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      const y = vec3u(256);
      const _z = bitShiftLeft(x, shift);
      const _w = bitShiftRight(y, shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3i(256);
        let y = vec3u(256);
        let _z = (x << shift);
        let _w = (y >> shift);
      }"
    `);
  });

  it('can be invoked as infix method', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      const y = vec3u(256);
      const _z = x.bitShiftLeft(shift);
      const _w = y.bitShiftRight(shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3i(256);
        let y = vec3u(256);
        let _z = (x << shift);
        let _w = (y >> shift);
      }"
    `);
  });

  it('rhs can be a number', () => {
    const f = () => {
      'use gpu';
      const x = vec3i(256);
      const _z = x.bitShiftLeft(4);
      const _w = x.bitShiftRight(4);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let x = vec3i(256);
        let _z = (x << vec3u(4u));
        let _w = (x >> vec3u(4u));
      }"
    `);
  });

  it('throws when lhs is a float vector', () => {
    const x = vec3f(1, 2, 3);
    // @ts-expect-error
    expect(() => bitShiftLeft(x, vec3u(1, 2, 3))).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftLeft' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );

    // @ts-expect-error
    expect(() => bitShiftRight(x, vec3u(1, 2, 3))).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );
  });

  it('throws when operands are different arity vectors', () => {
    const x = vec3i(1, 2, 3);
    // @ts-expect-error
    expect(() => bitShiftLeft(x, vec2u(1))).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftLeft' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );
    // @ts-expect-error
    expect(() => bitShiftRight(x, vec2u(1))).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );

    const f1 = () => {
      'use gpu';
      const shift = vec2u(4);
      let x = vec3i(256);
      // @ts-expect-error
      x.bitShiftLeft(shift);
    };

    expect(() => tgpu.resolve([f1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f1
      - fn*:f1(): Unsupported data types: vec2u. Supported types are: u32, vec3u.]
    `);

    const f2 = () => {
      'use gpu';
      const shift = vec2u(4);
      let x = vec3i(256);
      // @ts-expect-error
      x.bitShiftRight(shift);
    };

    expect(() => tgpu.resolve([f2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f2
      - fn*:f2(): Unsupported data types: vec2u. Supported types are: u32, vec3u.]
    `);
  });

  it('is available only on integer vectors (at type level)', () => {
    const x = vec3f(1, 2, 3);
    // @ts-expect-error
    x.bitShiftLeft;
    // @ts-expect-error
    x.bitShiftRight;

    const y = vec3i(1, 2, 3);
    y.bitShiftLeft(2);
  });
});
