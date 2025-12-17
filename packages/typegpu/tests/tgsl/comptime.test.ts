import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import * as d from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';

describe('comptime', () => {
  it('should work in JS', () => {
    const myComptime = tgpu['~unstable'].comptime(() => 0.5);

    const myFn = tgpu.fn([], d.f32)(() => {
      return myComptime();
    });

    expect(myFn()).toBe(0.5);
  });

  it('should work when returning a constant', () => {
    const myComptime = tgpu['~unstable'].comptime(() => 0.5);

    const myFn = tgpu.fn([], d.f32)(() => {
      return myComptime();
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 0.5f;
      }"
    `);
  });

  it('should work when returning a reference', () => {
    let a = 0;
    const myComptime = tgpu['~unstable'].comptime(() => a);
    const myFn = tgpu.fn([], d.f32)(() => {
      return myComptime();
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 0f;
      }"
    `);

    a = 1;
    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 1f;
      }"
    `);
  });

  it('should work in "normal" mode', () => {
    const stagger = tgpu['~unstable'].comptime((v: d.v3f) => {
      return v.add(d.vec3f(0, 1, 2));
    });

    const myFn = tgpu.fn([], d.f32)(() => {
      return stagger(d.vec3f(2)).z;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 4f;
      }"
    `);
  });
});
