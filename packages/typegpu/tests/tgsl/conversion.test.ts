import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { expectDataTypeOf } from '../utils/parseResolved.ts';
import tgpu, { d } from 'typegpu';

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
    const fn = () => {
      'use gpu';
      const t = [d.i32(1), d.f32(2)];
      return t[0];
    };

    expectDataTypeOf(fn).toBe(d.f32);
  });

  it('performs pointer dereferencing', () => {
    const fn = tgpu.fn(
      [d.ptrFn(d.f32)],
      d.f32,
    )((a) => {
      const t = [a.$, d.f32(2)];
      return t[0] as number;
    });

    expectDataTypeOf(fn).toBe(d.f32);
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
});
