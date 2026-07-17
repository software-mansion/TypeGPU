import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';
import { UnknownData } from 'typegpu/~internal';

describe('f32', () => {
  it('differs in type from other numeric schemas', () => {
    const acceptsF32Schema = (_schema: d.F32) => {};

    acceptsF32Schema(d.f32);
    // @ts-expect-error
    acceptsF32Schema(d.i32);
    // @ts-expect-error
    acceptsF32Schema(d.u32);
  });
});

describe('i32', () => {
  it('differs in type from other numeric schemas', () => {
    const acceptsI32Schema = (_schema: d.I32) => {};

    acceptsI32Schema(d.i32);
    // @ts-expect-error
    acceptsI32Schema(d.u32);
    // @ts-expect-error
    acceptsI32Schema(d.f32);
  });
});

describe('u32', () => {
  it('differs in type from other numeric schemas', () => {
    const acceptsU32Schema = (_schema: d.U32) => {};

    acceptsU32Schema(d.u32);
    // @ts-expect-error
    acceptsU32Schema(d.i32);
    // @ts-expect-error
    acceptsU32Schema(d.f32);
  });
});

describe('f16', () => {
  it('differs in type from other numeric schemas', () => {
    const acceptsF16Schema = (_schema: d.F16) => {};

    acceptsF16Schema(d.f16);
    // @ts-expect-error
    acceptsF16Schema(d.i32);
    // @ts-expect-error
    acceptsF16Schema(d.u32);
  });
});

describe('bool', () => {
  it('correctly casts values to booleans', () => {
    expect(d.bool(0)).toBe(false);
    expect(d.bool(1)).toBe(true);
    expect(d.bool(false)).toBe(false);
    expect(d.bool(true)).toBe(true);
  });

  it('throws if argument is not a number or boolean', () => {
    // @ts-expect-error
    expect(() => d.bool({})).toThrowErrorMatchingInlineSnapshot(
      `[Error: Invalid argument type for 'd.bool'. Got object, expected number or boolean]`,
    );
  });

  it('throws if passed number is not finite', () => {
    expect(() => d.bool(NaN)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'NaN' to type bool because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
  });

  it('does not accept a possibly undefined argument', () => {
    const possiblyUndefined = 1 as number | undefined;
    // @ts-expect-error
    () => d.bool(possiblyUndefined);
  });
});

it('has correct default values', () => {
  expect(d.f32()).toBe(0);
  expect(d.f16()).toBe(0);
  expect(d.i32()).toBe(0);
  expect(d.u32()).toBe(0);
  expect(d.bool()).toBe(false);
});

describe('TGSL', () => {
  it('works for default constructors', () => {
    const main = tgpu.fn([])(() => {
      const f = d.f32();
      const h = d.f16();
      const i = d.i32();
      const u = d.u32();
      const b = d.bool();
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        const f = 0f;
        const h = 0h;
        const i = 0i;
        const u = 0u;
        const b = false;
      }"
    `);
  });

  describe('bool', () => {
    it('works with scalars', () => {
      const f = tgpu.fn([d.bool, d.u32, d.i32, d.f32, d.f16])((b, u, i, f, h) => {
        const _bb = d.bool(b);
        const _ub = d.bool(u);
        const _ib = d.bool(i);
        const _fb = d.bool(f);
        const _hb = d.bool(h);
      });

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f(b: bool, u: u32, i: i32, f_1: f32, h: f16) {
          let _bb = b;
          let _ub = bool(u);
          let _ib = bool(i);
          let _fb = bool(f_1);
          let _hb = bool(h);
        }"
      `);
    });

    it('throws when argument datatype is unknown', () => {
      const ud = tgpu['~unstable'].rawCodeSnippet(
        '',
        UnknownData as unknown as d.AnyData,
        'runtime',
        false,
      );

      const f = () => {
        'use gpu';
        // @ts-expect-error
        const _bud = d.bool(ud.$);
      };

      expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn*:f
        - fn*:f()
        - fn:bool: Unknown argument type for 'd.bool'.]
      `);
    });

    it('throws when argument datatype is not numeric and boolean', () => {
      const f = () => {
        'use gpu';
        const v = d.vec3f();
        // @ts-expect-error
        const _bv = d.bool(v);
      };

      expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn*:f
        - fn*:f()
        - fn:bool: Unsupported data types: vec3f. Supported types are: bool, u32, i32, f32, f16.]
      `);
    });
  });
});

describe('Edge cases', () => {
  it('throws when called on +Infinity', () => {
    expect(() => d.f32(Infinity)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'Infinity' to type f32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.f16(Infinity)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'Infinity' to type f16 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.i32(Infinity)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'Infinity' to type i32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.u32(Infinity)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'Infinity' to type u32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
  });

  it('throws when called on -Infinity', () => {
    expect(() => d.f32(-Infinity)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value '-Infinity' to type f32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.f16(-Infinity)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value '-Infinity' to type f16 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.i32(-Infinity)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value '-Infinity' to type i32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.u32(-Infinity)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value '-Infinity' to type u32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
  });

  it('throws when called on NaN', () => {
    expect(() => d.f32(NaN)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'NaN' to type f32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.f16(NaN)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'NaN' to type f16 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.i32(NaN)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'NaN' to type i32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
    expect(() => d.u32(NaN)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot convert value 'NaN' to type u32 because of the Finite Math Assumption (see: https://www.w3.org/TR/WGSL/#finite-math-assumption)]`,
    );
  });
});
