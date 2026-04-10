import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { not } from '../../../src/std/boolean.ts';
import tgpu, { d, std } from '../../../src/index.js';

describe('not', () => {
  it('negates booleans', () => {
    expect(not(true)).toBe(false);
    expect(not(false)).toBe(true);
  });

  it('converts numbers to booleans and negates', () => {
    expect(not(0)).toBe(true);
    expect(not(-1)).toBe(false);
    expect(not(42)).toBe(false);
  });

  it('negates boolean vectors', () => {
    expect(not(d.vec2b(true, false))).toStrictEqual(d.vec2b(false, true));
    expect(not(d.vec3b(false, false, true))).toStrictEqual(d.vec3b(true, true, false));
    expect(not(d.vec4b(true, true, false, false))).toStrictEqual(d.vec4b(false, false, true, true));
  });

  it('converts numeric vectors to booleans vectors and negates component-wise', () => {
    expect(not(d.vec2f(0.0, 1.0))).toStrictEqual(d.vec2b(true, false));
    expect(not(d.vec3i(0, 5, -1))).toStrictEqual(d.vec3b(true, false, false));
    expect(not(d.vec4u(0, 0, 1, 0))).toStrictEqual(d.vec4b(true, true, false, true));
    expect(not(d.vec4h(0, 3.14, 0, -2.5))).toStrictEqual(d.vec4b(true, false, true, false));
  });

  it('negates truthiness check', () => {
    expect(not(null)).toBe(true);
    expect(not(undefined)).toBe(true);
    expect(not({})).toBe(false);
  });

  it('mimics WGSL behavior on NaN', () => {
    expect(not(NaN)).toBe(false);
  });

  it('generates correct WGSL on a boolean runtime-known argument', () => {
    const testFn = tgpu.fn(
      [d.bool],
      d.bool,
    )((v) => {
      return not(v);
    });
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn(v: bool) -> bool {
        return !v;
      }"
    `);
  });

  it('generates correct WGSL on a numeric runtime-known argument', () => {
    const testFn = tgpu.fn(
      [d.i32],
      d.bool,
    )((v) => {
      return not(v);
    });
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
        "fn testFn(v: i32) -> bool {
          return !bool(v);
        }"
      `);
  });

  it('generates correct WGSL on a boolean vector runtime-known argument', () => {
    const testFn = tgpu.fn(
      [d.vec3b],
      d.vec3b,
    )((v) => {
      return not(v);
    });
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn(v: vec3<bool>) -> vec3<bool> {
        return !(v);
      }"
    `);
  });

  it('generates correct WGSL on a numeric vector runtime-known argument', () => {
    const testFn = tgpu.fn(
      [d.vec3f],
      d.vec3b,
    )((v) => {
      return not(v);
    });
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn(v: vec3f) -> vec3<bool> {
        return !(vec3<bool>(v));
      }"
    `);
  });

  it('generates correct WGSL on a numeric vector comptime-known argument', () => {
    const f = () => {
      'use gpu';
      const v = not(d.vec4f(Infinity, -Infinity, 0, NaN));
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var v = vec4<bool>(false, false, true, false);
      }"
    `);
  });

  it('evaluates at compile time for comptime-known arguments', () => {
    const getN = tgpu.comptime(() => 42);
    const slot = tgpu.slot<{ a?: number }>({});

    const f = () => {
      'use gpu';
      if (not(getN()) && not(slot.$.a) && not(d.vec4f(1, 8, 8, 2)).x) {
        return 1;
      }
      return -1;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        if (((false && true) && false)) {
          return 1;
        }
        return -1;
      }"
    `);
  });

  it('mimics JS on non-primitive values', ({ root }) => {
    const buffer = root.createUniform(d.mat4x4f);
    const testFn = tgpu.fn([d.vec3f, d.atomic(d.u32), d.ptrPrivate(d.u32)])((v, a, p) => {
      const _b0 = !buffer;
      const _b1 = !buffer.$;
      const _b2 = !v;
      const _b3 = !a;
      const _b4 = !std.atomicLoad(a);
      const _b5 = !p;
      const _b6 = !p.$;
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> buffer: mat4x4f;

      fn testFn(v: vec3f, a: atomic<u32>, p: ptr<private, u32>) {
        const _b0 = false;
        const _b1 = false;
        const _b2 = false;
        const _b3 = false;
        let _b4 = !bool(atomicLoad(&a));
        const _b5 = false;
        let _b6 = !bool((*p));
      }"
    `);
  });
});
