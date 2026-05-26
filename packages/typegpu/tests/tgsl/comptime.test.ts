import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import tgpu, { d } from '../../src/index.js';

describe('comptime', () => {
  it('should work in JS', () => {
    const myComptime = tgpu.comptime(() => 0.5);

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return myComptime();
    });

    expect(myFn()).toBe(0.5);
  });

  it('should work when returning a constant', () => {
    const myComptime = tgpu.comptime(() => 0.5);

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
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
    const myComptime = tgpu.comptime(() => a);
    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
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
    const stagger = tgpu.comptime((v: d.v3f) => {
      return v.add(d.vec3f(0, 1, 2));
    });

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return stagger(d.vec3f(2)).z;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 4f;
      }"
    `);
  });

  it('can read accessors during shader resolution', () => {
    const value = tgpu.accessor(d.f32, 1);
    const readValue = tgpu.comptime(() => value.$);

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return readValue();
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 1f;
      }"
    `);

    expect(tgpu.resolve([myFn.with(value, 2)])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 2f;
      }"
    `);
  });

  it('throws when a comptime-read accessor has no value', () => {
    const value = tgpu.accessor(d.f32);
    const readValue = tgpu.comptime(() => value.$);
    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return readValue();
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn
      - fn:readValue: Missing value for 'slot:value']
    `);
  });
});
