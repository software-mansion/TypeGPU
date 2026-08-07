import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { not } from 'typegpu/std';
import { tgpu, d } from 'typegpu';

describe('not', () => {
  it('negates booleans', () => {
    expect(not(true)).toBe(false);
    expect(not(false)).toBe(true);
  });

  it('negates boolean vectors', () => {
    expect(not(d.vec2b(true, false))).toStrictEqual(d.vec2b(false, true));
    expect(not(d.vec3b(false, false, true))).toStrictEqual(d.vec3b(true, true, false));
    expect(not(d.vec4b(true, true, false, false))).toStrictEqual(d.vec4b(false, false, true, true));
  });

  it('throws on non-boolean operand', () => {
    // @ts-expect-error
    expect(() => not(0)).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'std.not' requires a boolean or boolean vector.]`,
    );
    // @ts-expect-error
    expect(() => not(d.vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'std.not' requires a boolean or boolean vector.]`,
    );
    // @ts-expect-error
    expect(() => not({})).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'std.not' requires a boolean or boolean vector.]`,
    );
  });

  it('generates correct WGSL on a boolean runtime-known argument', () => {
    const testFn = tgpu.fn(
      [d.bool],
      d.bool,
    )((b) => {
      return not(b);
    });
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn(b: bool) -> bool {
        return !b;
      }"
    `);
  });

  it('generates correct WGSL on a boolean vector runtime-known argument', () => {
    const testFn = tgpu.fn(
      [d.vec3b],
      d.vec3b,
    )((vb) => {
      return not(vb);
    });
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn(vb: vec3<bool>) -> vec3<bool> {
        return !vb;
      }"
    `);
  });

  it('throws on non-boolean runtime-known operands', () => {
    const testFn1 = tgpu.fn(
      [d.i32],
      d.bool,
    )((x) => {
      // @ts-expect-error
      return not(x);
    });

    expect(() => tgpu.resolve([testFn1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn1
      - fn:not: Unsupported data types: i32. Supported types are: bool, vec2<bool>, vec3<bool>, vec4<bool>.]
    `);

    const Boid = d.struct({ pos: d.vec3f });
    const testFn2 = tgpu.fn(
      [Boid],
      d.bool,
    )((s) => {
      // @ts-expect-error
      return not(s);
    });
    expect(() => tgpu.resolve([testFn2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:testFn2
      - fn:not: Unsupported data types: struct. Supported types are: bool, vec2<bool>, vec3<bool>, vec4<bool>.]
    `);
  });

  it('injects the result into WGSL if operand is comptime-known', () => {
    const b = true;
    const vb = d.vec3b(true, false, true);

    const f = () => {
      'use gpu';
      const _notB = not(b);
      const _notVb = not(vb);
    };
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _notB = false;
        let _notVb = vec3<bool>(false, true, false);
      }"
    `);
  });
});
