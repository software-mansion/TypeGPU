import { describe, expect, it, vi } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('inverseSqrt', () => {
  it('computes inverse square root of a number', () => {
    expect(std.inverseSqrt(4)).toBe(0.5);
  });

  it('casts integer scalar arguments to f32', () => {
    using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const foo = tgpu.fn(
      [d.u32, d.i32],
      d.f32,
    )((a, b) => {
      'use gpu';
      return std.inverseSqrt(a) + std.inverseSqrt(b);
    });

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo(a: u32, b: i32) -> f32 {
        return (inverseSqrt(f32(a)) + inverseSqrt(f32(b)));
      }"
    `);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('throws on integer vector arguments', () => {
    const foo = tgpu.fn([d.vec2u])((a) => {
      'use gpu';
      // @ts-expect-error
      std.inverseSqrt(a);
    });

    expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:foo
      - fn:inverseSqrt: Unsupported data types: vec2u. Supported types are: f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.]
    `);
  });
});
