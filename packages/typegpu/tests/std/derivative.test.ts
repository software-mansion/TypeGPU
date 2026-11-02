import { describe, expect, it, vi } from 'vitest';
import { tgpu, d, std } from 'typegpu';

const derivatives = [
  std.dpdx,
  std.dpdxCoarse,
  std.dpdxFine,
  std.dpdy,
  std.dpdyCoarse,
  std.dpdyFine,
  std.fwidth,
  std.fwidthCoarse,
  std.fwidthFine,
];

describe('derivative builtins', () => {
  it('accept f32 and f32 vector arguments', () => {
    const foo = tgpu.fn(
      [d.f32, d.vec3f],
      d.vec3f,
    )((a, b) => {
      'use gpu';
      const x = std.dpdx(a);
      return std.dpdy(b) + std.fwidth(b) * x;
    });

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo(a: f32, b: vec3f) -> vec3f {
        let x = dpdx(a);
        return (dpdy(b) + (fwidth(b) * x));
      }"
    `);
  });

  it('cast integer scalar arguments to f32', () => {
    using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const foo = tgpu.fn(
      [d.u32, d.i32],
      d.f32,
    )((a, b) => {
      'use gpu';
      return std.dpdx(a) + std.dpdy(b);
    });

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo(a: u32, b: i32) -> f32 {
        return (dpdx(f32(a)) + dpdy(f32(b)));
      }"
    `);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it.each(derivatives)('%s throws on integer vector arguments', (derivative) => {
    const foo = tgpu.fn([d.vec2u])((a) => {
      'use gpu';
      // @ts-expect-error
      derivative(a);
    });

    expect(() => tgpu.resolve([foo])).toThrow(
      'Unsupported data types: vec2u. Supported types are: f32, vec2f, vec3f, vec4f.',
    );
  });
});
