import { describe, expect, expectTypeOf, it } from 'vitest';
import tgpu, { d } from '../../../src/index.ts';
import { div, isCloseTo } from '../../../src/std/index.ts';

describe('div', () => {
  it('divides numbers just like js would', () => {
    expect(div(4, 2)).toBeCloseTo(2);
    expect(div(3, 2)).toBeCloseTo(1.5);
    expect(div(d.u32(3), d.u32(2))).toBeCloseTo(1.5);
  });

  it('computes quotient of vecNf and a number', () => {
    expect(isCloseTo(div(d.vec2f(1, 2), 2), d.vec2f(0.5, 1))).toBe(true);
    expect(isCloseTo(div(d.vec3f(1, 2, 3), 3), d.vec3f(0.333, 0.666, 1))).toBe(
      true,
    );
    expect(
      isCloseTo(div(d.vec4f(1, 2, 3, 4), 4), d.vec4f(0.25, 0.5, 0.75, 1)),
    ).toBe(true);
  });

  it('computes quotient of vecNi and a number', () => {
    expect(div(d.vec2i(1, 2), 1)).toStrictEqual(d.vec2i(1, 2));
    expect(div(d.vec3i(1, 2, 3), 2)).toStrictEqual(d.vec3i(0, 1, 1));
    expect(div(d.vec4i(5, 6, 7, 8), 3)).toStrictEqual(d.vec4i(1, 2, 2, 2));
  });

  it('computes quotient of a number and vecNf', () => {
    expect(isCloseTo(div(2, d.vec2f(1, 2)), d.vec2f(2, 1))).toBe(true);
    expect(isCloseTo(div(3, d.vec3f(1, 2, 3)), d.vec3f(3, 1.5, 1))).toBe(
      true,
    );
    expect(
      isCloseTo(div(4, d.vec4f(1, 2, 3, 4)), d.vec4f(4, 2, 1.33, 1)),
    ).toBe(true);
  });

  it('computes quotient of a number and vecNi', () => {
    expect(div(1, d.vec2i(1, 2))).toStrictEqual(d.vec2i(1, 0));
    expect(div(2, d.vec3i(1, 2, 3))).toStrictEqual(d.vec3i(2, 1, 0));
    expect(div(3, d.vec4i(5, 6, 7, 8))).toStrictEqual(d.vec4i());
  });

  it('computes quotient of vecNh and vecNh', () => {
    expect(isCloseTo(div(d.vec2h(1, 2), d.vec2h(4)), d.vec2h(0.25, 0.5))).toBe(
      true,
    );
    expect(
      isCloseTo(div(d.vec3h(1, 2, 3), d.vec3h(3)), d.vec3h(0.333, 0.666, 1)),
    ).toBe(true);
    expect(
      isCloseTo(
        div(d.vec4h(1.5, 2, 3, 4), d.vec4h(2)),
        d.vec4h(0.75, 1, 1.5, 2),
      ),
    ).toBe(true);
  });

  it('computes quotient of vecNu and vecNu', () => {
    expect(div(d.vec2u(1, 2), d.vec2u(2))).toStrictEqual(d.vec2u(0, 1));
    expect(div(d.vec3u(5, 6, 7), d.vec3u(3))).toStrictEqual(d.vec3u(1, 2, 2));
    expect(div(d.vec4u(1, 2, 8, 9), d.vec4u(4))).toStrictEqual(
      d.vec4u(0, 0, 2, 2),
    );
  });

  it('handles division by 0', () => {
    expect(div(d.vec2u(1, 2), d.vec2u(0))).toStrictEqual(d.vec2u(1, 2));
    expect(div(d.vec4u(1, 2, 8, 9), 0)).toStrictEqual(d.vec4u(1, 2, 8, 9));
  });

  describe('in tgsl', () => {
    describe('with f32 return type', () => {
      it('const / const', () => {
        const foo = tgpu.fn([], d.f32)(() => 1 / 2);
        expect(foo()).toBe(0.5);

        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo() -> f32 {
            return 0.5f;
          }"
        `);
      });

      it('const u32 / const u32', () => {
        // oxlint-disable-next-line typegpu/integer-division -- it's a test
        const foo = tgpu.fn([], d.f32)(() => d.u32(1) / d.u32(2));
        expect(foo()).toBe(0.5);
        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo() -> f32 {
            return 0.5f;
          }"
        `);
      });

      it('const i32 / const i32', () => {
        // oxlint-disable-next-line typegpu/integer-division -- it's a test
        const foo = tgpu.fn([], d.f32)(() => d.i32(1) / d.i32(2));
        expect(foo()).toBe(0.5);
        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo() -> f32 {
            return 0.5f;
          }"
        `);
      });

      it('var u32 / var u32', () => {
        const foo = tgpu.fn([d.u32, d.u32], d.f32)((a, b) => a / b);
        expect(foo(1, 2)).toBe(0.5);
        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo(a: u32, b: u32) -> f32 {
            return (f32(a) / f32(b));
          }"
        `);
      });

      it('var u32 / const', () => {
        const foo = tgpu.fn([d.u32], d.f32)((a) => a / 2);
        expect(foo(1)).toBe(0.5);
        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo(a: u32) -> f32 {
            return (f32(a) / 2f);
          }"
        `);
      });

      it('const / var u32', () => {
        const foo = tgpu.fn([d.u32], d.f32)((a) => 1 / a);
        expect(foo(2)).toBe(0.5);
        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo(a: u32) -> f32 {
            return (1f / f32(a));
          }"
        `);
      });

      it('const f32 / const i32', () => {
        // oxlint-disable-next-line typegpu/integer-division -- it's a test
        const foo = tgpu.fn([], d.f32)(() => d.f32(1.0) / d.i32(2.0));
        expect(foo()).toBe(0.5);
        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo() -> f32 {
            return 0.5f;
          }"
        `);
      });

      it('const u32 / const i32', () => {
        // oxlint-disable-next-line typegpu/integer-division -- it's a test
        const foo = tgpu.fn([], d.f32)(() => d.u32(1) / d.i32(2));
        expect(foo()).toBe(0.5);
        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo() -> f32 {
            return 0.5f;
          }"
        `);
      });

      it('const f16 / const f32', () => {
        const foo = tgpu.fn([], d.f32)(() => d.f16(0.5) / d.f32(4));
        expect(foo()).toBe(0.125);
        expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
          "fn foo() -> f32 {
            return 0.125f;
          }"
        `);
      });
    });

    describe('with u32 return type', () => {
      it('const / const', () => {
        const bar = tgpu.fn([], d.u32)(() => 1 / 2);
        expect(bar()).toBe(0);

        expect(tgpu.resolve([bar])).toMatchInlineSnapshot(`
          "fn bar() -> u32 {
            return 0u;
          }"
        `);
      });
    });
  });
});

describe('div overload', () => {
  it('has correct return type', () => {
    expectTypeOf(div(5, 1)).toEqualTypeOf<number>();
    expectTypeOf(div(5, d.vec3f())).toEqualTypeOf<d.v3f>();
    expectTypeOf(div(d.vec2f(), 1)).toEqualTypeOf<d.v2f>();
    expectTypeOf(div(d.vec4f(), d.vec4f())).toEqualTypeOf<d.v4f>();
    expectTypeOf(div(d.vec3u(), d.vec3u())).toEqualTypeOf<d.v3u>();
  });

  it('rejects when incompatible types', () => {
    // @ts-expect-error
    (() => div(d.vec2f(), d.vec2u()));
    // @ts-expect-error
    (() => div(d.vec2f(), d.vec3f()));
    // @ts-expect-error
    (() => div(mat3x3f(), mat3x3f()));
  });
});
