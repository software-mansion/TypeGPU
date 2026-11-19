import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { expectDataTypeOf } from '../utils/parseResolved.ts';
import { tgpu, d } from 'typegpu';

describe('convertToCommonType', () => {
  it('converts identical types', () => {
    const fn = () => {
      'use gpu';
      const t = [d.f32(1), d.f32(2)];
      return t[0];
    };

    expectDataTypeOf(fn).toBe(d.f32);
  });

  it('handles abstract types automatically', () => {
    const fn = () => {
      'use gpu';
      const t = [1.5, d.f32(2), 1];
      return t[0];
    };

    expectDataTypeOf(fn).toBe(d.f32);
  });

  it('performs implicit casts and warns', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fn = () => {
      'use gpu';
      const t = [d.i32(1), d.f32(2)];
      return t[0];
    };

    expectDataTypeOf(fn).toBe(d.f32);

    expect(consoleSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [implicit-conversion] ",
          "Implicit conversions from [
        d.i32(1): i32,
        d.f32(2): f32
      ] to f32 are supported, but not recommended.
      In '[d.i32(1), d.f32(2)]', inside function 'fn'.
      Consider using explicit conversions instead.",
        ],
      ]
    `);

    consoleSpy.mockRestore();
  });

  it('performs pointer dereferencing', () => {
    function fn(a: d.ref<number>) {
      'use gpu';
      const t = [a.$, d.f32(2)]; // <- should convert all elements to f32
      return t[0] as number;
    }

    expectDataTypeOf(() => {
      'use gpu';
      const numRef = d.ref(1);
      return fn(numRef);
    }).toBe(d.f32);
  });

  it('returns undefined for incompatible types', () => {
    const fn = () => {
      'use gpu';
      const t = [d.vec2f(1), d.f32(2)];
      return t[0];
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Values '[d.vec2f(1), d.f32(2)]' cannot be automatically converted to a common type. Consider wrapping the array in an appropriate schema]
    `);
  });

  it('returns undefined if any type is UnknownData', () => {
    const fn = () => {
      'use gpu';
      const t = ['unknownData', d.f32(2)];
      return t[0];
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Values '["unknownData", d.f32(2)]' cannot be automatically converted to a common type. Consider wrapping the array in an appropriate schema]
    `);
  });

  it('returns undefined for empty input', () => {
    const fn = () => {
      'use gpu';
      const t = [] as number[];
      return t[0];
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Cannot infer the type of an empty array literal.]
    `);
  });

  it('chooses abstractFloat over i32', () => {
    const fn = () => {
      'use gpu';
      const t = [d.i32(1), 1.5];
      return t[0];
    };

    expectDataTypeOf(fn).toBe(d.f32);
  });

  const Struct = d.struct({
    a: d.f32,
    b: d.i32,
    c: d.vec2f,
    d: d.bool,
  });

  it('maps values matching types exactly', () => {
    const fn = () => {
      'use gpu';
      const s = Struct({ a: d.f32(1), b: d.i32(2), c: d.vec2f(1), d: true });
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "struct Struct {
        a: f32,
        b: i32,
        c: vec2f,
        d: bool,
      }

      fn fn_1() {
        let s = Struct(1f, 2i, vec2f(1), true);
      }"
    `);
  });

  it('maps values requiring implicit casts and warns', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fn = () => {
      'use gpu';
      const s = Struct({ a: d.i32(1), b: d.u32(2), c: d.vec2f(1), d: true });
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "struct Struct {
        a: f32,
        b: i32,
        c: vec2f,
        d: bool,
      }

      fn fn_1() {
        let s = Struct(1f, 2i, vec2f(1), true);
      }"
    `);

    expect(consoleSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [implicit-conversion] ",
          "Implicit conversions from [
        d.i32(1): i32
      ] to f32 are supported, but not recommended.
      In '{ a: d.i32(1), b: d.u32(2), c: d.vec2f(1), d: true }', inside function 'fn'.
      Consider using explicit conversions instead.",
        ],
        [
          "⚠️ [implicit-conversion] ",
          "Implicit conversions from [
        d.u32(2): u32
      ] to i32 are supported, but not recommended.
      In '{ a: d.i32(1), b: d.u32(2), c: d.vec2f(1), d: true }', inside function 'fn'.
      Consider using explicit conversions instead.",
        ],
      ]
    `);

    consoleSpy.mockRestore();
  });

  it('throws on missing property', () => {
    const fn = () => {
      'use gpu';
      // @ts-expect-error
      const s = Struct({ a: d.i32(1), c: d.vec2f(1), d: true });
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Missing property b in object literal for struct struct:Struct]
    `);
  });

  it('automatically converts on index access', () => {
    const fn = () => {
      'use gpu';
      const arr = [1, 2, 3, 4];
      const x = arr[d.f32(1)];
      const y = arr[d.f16(1)];
      const z = arr[d.i32(1)];
      const t = arr[d.u32(1)];
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        let arr = array<i32, 4>(1, 2, 3, 4);
        let x = arr[1u];
        let y = arr[1u];
        let z = arr[1i];
        let t = arr[1u];
      }"
    `);
  });

  it('automatically converts on assignment', () => {
    const fn = () => {
      'use gpu';
      let a = d.u32(1);
      a = d.f32(2);
      a = d.i32(3);
      a = 4.5;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = 1u;
        a = 2u;
        a = 3u;
        a = 4u;
      }"
    `);
  });

  it('automatically converts on update', () => {
    const fn = () => {
      'use gpu';
      let a = d.u32(1);
      a += d.f32(2);
      a += d.i32(3);
      a += 4.5;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = 1u;
        a += 2u;
        a += 3u;
        a += 4u;
      }"
    `);
  });
});

describe('implicit conversion warnings', () => {
  it('point at the expression and the function in which the conversion happens', () => {
    using consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function main() {
      'use gpu';
      const int = d.i32(1);
      const result = int * 0.5;
    }

    tgpu.resolve([main]);

    expect(consoleSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [implicit-conversion] ",
          "Implicit conversions from [
        int: i32
      ] to f32 are supported, but not recommended.
      In 'int * 0.5', inside function 'main'.
      Consider using explicit conversions instead.",
        ],
      ]
    `);
  });

  it('point at the statement when the converted value is the whole expression', () => {
    using consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const getOne = tgpu.fn(
      [],
      d.f32,
    )(() => {
      const int = d.i32(1);
      return int;
    });

    tgpu.resolve([getOne]);

    expect(consoleSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [implicit-conversion] ",
          "Implicit conversions from [
        int: i32
      ] to f32 are supported, but not recommended.
      In 'return int', inside function 'getOne'.
      Consider using explicit conversions instead.",
        ],
      ]
    `);
  });

  it('name the function being generated, not the function calling it', () => {
    using consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function helper() {
      'use gpu';
      const uint = d.u32(2);
      return uint * 0.5;
    }

    function main() {
      'use gpu';
      const half = helper();
      // The context of `main` should be restored after `helper` is generated
      const int = d.i32(1);
      const quarter = int * 0.25;
    }

    tgpu.resolve([main]);

    expect(consoleSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [implicit-conversion] ",
          "Implicit conversions from [
        uint: u32
      ] to f32 are supported, but not recommended.
      In 'uint * 0.5', inside function 'helper'.
      Consider using explicit conversions instead.",
        ],
        [
          "⚠️ [implicit-conversion] ",
          "Implicit conversions from [
        int: i32
      ] to f32 are supported, but not recommended.
      In 'int * 0.25', inside function 'main'.
      Consider using explicit conversions instead.",
        ],
      ]
    `);
  });

  it('shorten long expressions', () => {
    using consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function main() {
      'use gpu';
      const firstValueWithAVeryLongName = d.i32(1);
      const secondValueWithAVeryLongName = d.i32(2);
      const thirdValueWithAVeryLongName = d.i32(3);
      const values = [
        firstValueWithAVeryLongName,
        secondValueWithAVeryLongName,
        thirdValueWithAVeryLongName,
        d.f32(4),
      ];
    }

    tgpu.resolve([main]);

    expect(consoleSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [implicit-conversion] ",
          "Implicit conversions from [
        firstValueWithAVeryLongName: i32,
        secondValueWithAVeryLongName: i32,
        thirdValueWithAVeryLongName: i32,
        d.f32(4): f32
      ] to i32 are supported, but not recommended.
      In '[firstValueWithAVeryLongName, secondValueWithAVeryLongName, thirdValueWithAVe...', inside function 'main'.
      Consider using explicit conversions instead.",
        ],
      ]
    `);
  });
});
