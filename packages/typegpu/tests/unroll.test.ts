import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';

describe('tgpu.unroll', () => {
  it('called outside shader and outside forOf returns passed iterable', () => {
    const arr = [1, 2, 3];

    const x = tgpu['~unstable'].unroll(arr);

    expect(x).toBe(arr);
  });

  it('called inside shader but outside forOf returns passed iterable', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.f32) },
    });

    const f = () => {
      'use gpu';
      const a = tgpu['~unstable'].unroll([1, 2, 3]);

      const v1 = d.vec2f(7);
      const v2 = tgpu['~unstable'].unroll(v1); // this should return a pointer
      const arr = tgpu['~unstable'].unroll(layout.$.arr); // this should return a pointer
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> arr: array<f32>;

      fn f() {
        var a = array<i32, 3>(1, 2, 3);
        var v1 = vec2f(7);
        let v2 = (&v1);
        let arr = (&arr);
      }"
    `);
  });

  it.skip('unrolls forOf of comptime array', () => {
    const f = () => {
      'use gpu';
      let result = d.f32(0);
      for (const item of tgpu['~unstable'].unroll([1, 2, 3])) { // should operate on values
        result += d.f32(item);
      }

      const arr = [1, 2, 3];
      for (const item of tgpu['~unstable'].unroll(arr)) { // should operate on indices
        result -= item;
      }

      const v = d.vec2f();
      for (const item of tgpu['~unstable'].unroll(v)) { // should operate on indices
        result *= item;
      }

      return result;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot();
  });

  it.skip('unrolls forOf of iterable provided by comptime', () => {
    const getArr = tgpu['~unstable'].comptime(() => [1, 2, 3]);
    // add basic external, derived, maybe slot and accessor

    const f = () => {
      'use gpu';
      let result = d.f32(0);
      for (const item of tgpu['~unstable'].unroll(getArr())) {
        result += d.f32(item);
      }

      return result;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot();
  });

  it.skip('throws error when number of iterations is unknown at comptime', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.f32) },
    });

    const f = () => {
      'use gpu';
      let res = d.f32(0);
      for (const foo of tgpu['~unstable'].unroll(layout.$.arr)) {
        res += foo;
      }
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Cannot unroll loop. Number of iterations unknown at compile time]
    `);
  });
});
