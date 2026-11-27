import { describe, expect, it, vi } from 'vitest';
import { bool, u32, i32, vec3f, vec3i, vec3u, f32, vec2u } from 'typegpu/data';
import { bitShiftLeft, bitShiftRight, select } from 'typegpu/std';
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
      - fn*:f(): Cannot convert 'shift' of type 'vec2u' to any of the target types: [vec3u]]
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

describe('bit shifts of comptime-known abstract integers', () => {
  const TEXELS = 16;
  const NEG = -16;
  const THREE = 3;
  const SHIFT = 1;

  it('folds >> compared with an i32', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [i32],
      bool,
    )((column) => {
      'use gpu';
      return column >= TEXELS >> 1;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(column: i32) -> bool {
        return (column >= 8i);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds << compared with an i32', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [i32],
      bool,
    )((column) => {
      'use gpu';
      return column >= TEXELS << 1;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(column: i32) -> bool {
        return (column >= 32i);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds >>> compared with an i32', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [i32],
      bool,
    )((column) => {
      'use gpu';
      return column >= TEXELS >>> 1;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(column: i32) -> bool {
        return (column >= 8i);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds >> and >>> compared with a u32', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [u32],
      bool,
    )((column) => {
      'use gpu';
      return column >= TEXELS >> 1 && column >= TEXELS >>> 1;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(column: u32) -> bool {
        return ((column >= 8u) && (column >= 8u));
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds >> compared with an f32', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [f32],
      bool,
    )((x) => {
      'use gpu';
      return x >= TEXELS >> 1;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(x: f32) -> bool {
        return (x >= 8f);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds shifts of number literals', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [i32],
      bool,
    )((column) => {
      'use gpu';
      return column >= 16 >> 1;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(column: i32) -> bool {
        return (column >= 8i);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds shifts assigned to i32 and u32 variables', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = () => {
      'use gpu';
      let a = i32(0);
      a = TEXELS >> 1;
      let b = u32(0);
      b = TEXELS << 2;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var a = 0i;
        a = 8i;
        var b = 0u;
        b = 64u;
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds shifts mixed into i32, u32 and f32 arithmetic', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn([i32, u32, f32])((a, b, c) => {
      'use gpu';
      const _x = a + (TEXELS >> 1);
      const _y = b + (TEXELS << 2);
      const _z = c * (TEXELS >> 1);
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(a: i32, b: u32, c: f32) {
        let _x = (a + 8i);
        let _y = (b + 64u);
        let _z = (c * 8f);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds shifts stored in a local const', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [i32],
      bool,
    )((column) => {
      'use gpu';
      const half = TEXELS >> 1;
      return column >= half;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(column: i32) -> bool {
        const half = 8;
        return (column >= half);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds shifts returned from an i32 function', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [],
      i32,
    )(() => {
      'use gpu';
      return TEXELS >> 1;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 8i;
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds shifts passed to explicit casts', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = () => {
      'use gpu';
      const _a = i32(TEXELS >> 1);
      const _b = u32(TEXELS >>> 1);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _a = 8i;
        const _b = 8u;
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds shifts inside select', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [i32],
      i32,
    )((column) => {
      'use gpu';
      return 3 - (2 + select(0, 1, column >= TEXELS >> 1));
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(column: i32) -> i32 {
        return (3i - (2i + select(0i, 1i, (column >= 8i))));
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('folds with JS semantics for negative and overflowing values', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn([i32, u32])((a, b) => {
      'use gpu';
      // JS: -8 (sign-extending)
      const _x = a >= NEG >> 1;
      // JS: 2147483640 (`>>>` reinterprets the lhs as u32)
      const _y = b >= NEG >>> 1;
      // JS: -1073741824 (WGSL's 64-bit abstract int would give 3221225472, which doesn't fit in i32)
      const _z = a >= THREE << 30;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(a: i32, b: u32) {
        let _x = (a >= -8i);
        let _y = (b >= 2147483640u);
        let _z = (a >= -1073741824i);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('still warns when the folded value changes after conversion', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn(
      [u32],
      bool,
    )((column) => {
      'use gpu';
      return column >= NEG >> 1;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(column: u32) -> bool {
        return (column >= 4294967288u);
      }"
    `);
    expect(consoleWarnSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [implicit-conversion] ",
          "Implicit abstract conversion from NEG >> 1: abstractInt to u32 changes the value to 4294967288. Use an explicit conversion if this behavior is intended.",
        ],
      ]
    `);
  });

  it('does not fold shifts of runtime values by a JS constant', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = tgpu.fn([i32, u32])((a, b) => {
      'use gpu';
      const _x = a >> SHIFT;
      const _y = a << SHIFT;
      const _z = b >>> SHIFT;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(a: i32, b: u32) {
        let _x = (a >> 1u);
        let _y = (a << 1u);
        let _z = (b >> 1u);
      }"
    `);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
