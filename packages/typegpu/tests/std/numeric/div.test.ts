import { describe, expect, expectTypeOf, it } from 'vitest';
import tgpu from '../../../src/index.ts';
import * as d from '../../../src/data/index.ts';
import { div, isCloseTo } from '../../../src/std/index.ts';
import { parse, parseResolved } from '../../utils/parseResolved.ts';

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
    it('works', () => {
      const foo = tgpu.fn([], d.f32)(() => 1 / 2);
      const bar = tgpu.fn([], d.u32)(() => 1 / 2);

      expect(parseResolved({ foo, bar })).toBe(parse(`
        fn foo() -> f32 { return 0.5; }
        fn bar() -> u32 { return u32(0.5); }
      `));
    });

    it('resolves correctly for two constants wrapped in u32 casts', () => {
      const foo = tgpu.fn([], d.f32)(() => d.u32(1) / d.u32(2));
      expect(foo()).toBe(0.5);
      expect(parseResolved({ foo })).toBe(parse(`
        fn foo() -> f32 {
          return (f32(u32(1)) / f32(u32(2)));
        }
      `));
    });

    it('resolves correctly for two constants wrapped in i32 casts', () => {
      const foo = tgpu.fn([], d.f32)(() => d.i32(1) / d.i32(2));
      expect(foo()).toBe(0.5);
      expect(parseResolved({ foo })).toMatchInlineSnapshot(
        `"fn foo ( ) -> f32 { return ( f32 ( i32 ( 1 ) ) / f32 ( i32 ( 2 ) ) ) ; }"`,
      );
    });

    it('tests division operator resolution - f32', () => {
      const foo = tgpu.fn([], d.f32)(() => d.f32(1) / d.f32(2));
      expect(foo()).toBe(0.5);
      expect(parseResolved({ foo })).toMatchInlineSnapshot(
        `"fn foo ( ) -> f32 { return 0.5 ; }"`,
      );
    });

    it('tests division operator resolution - f32 & i32', () => {
      const foo = tgpu.fn([], d.f32)(() => d.f32(1.0) / d.i32(2.0));
      expect(foo()).toBe(0.5);
      expect(parseResolved({ foo })).toMatchInlineSnapshot(
        `"fn foo ( ) -> f32 { return ( 1.f / f32 ( i32 ( 2 ) ) ) ; }"`,
      );
    });

    it('tests division operator resolution - u32 & i32', () => {
      const foo = tgpu.fn([], d.f32)(() => d.u32(1) / d.i32(2));
      expect(foo()).toBe(0.5);
      expect(parseResolved({ foo })).toMatchInlineSnapshot(
        `"fn foo ( ) -> f32 { return ( f32 ( u32 ( 1 ) ) / f32 ( i32 ( 2 ) ) ) ; }"`,
      );
    });

    it('tests division operator resolution - f16 & f32', () => {
      const foo = tgpu.fn([], d.f32)(() => d.f16(1.0) / d.f32(2.0));
      expect(foo()).toBe(0.5);
      expect(parseResolved({ foo })).toMatchInlineSnapshot(
        `"fn foo ( ) -> f32 { return ( f32 ( f16 ( 1 ) ) / 2.f ) ; }"`,
      );
    });

    it('tests division operator resolution - decimal & f32', () => {
      const foo = tgpu.fn([], d.f32)(() => d.f16(1 / 2) / d.f32(5.0));
      expect(foo()).toBe(0.1);
      expect(parseResolved({ foo })).toMatchInlineSnapshot(
        `"fn foo ( ) -> f32 { return ( f32 ( f16 ( 0.5 ) ) / 5.f ) ; }"`,
      );
    });

    it('tests division operator resolution - internal sum & f32', () => {
      const foo = tgpu.fn([], d.f32)(() => (d.u32(1 + 2) / d.f32(5.0)));
      expect(foo()).toBe(0.6);
      expect(parseResolved({ foo })).toMatchInlineSnapshot(
        `"fn foo ( ) -> f32 { return ( f32 ( u32 ( 3 ) ) / 5.f ) ; }"`,
      );
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

  it('accepts union', () => {
    // expect no errors
    div(1 as number | d.v2f, d.vec2f() as d.v2f);
    div(d.vec3f() as d.v3f | d.v4f, 1 as number | d.v3f | d.v4f);
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
