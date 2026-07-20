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
          "⚠️ [implicit-conversion}] ",
          "Implicit conversions from [
        1i: i32,
        2f: f32
      ] to f32 are supported, but not recommended.
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
          "⚠️ [implicit-conversion}] ",
          "Implicit conversions from [
        1i: i32
      ] to f32 are supported, but not recommended.
      Consider using explicit conversions instead.",
        ],
        [
          "⚠️ [implicit-conversion}] ",
          "Implicit conversions from [
        2u: u32
      ] to i32 are supported, but not recommended.
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
