import { describe, expect, it } from 'vitest';
import tgpu, { d, std } from '../../../src/index.js';

describe('min', () => {
  it('acts as identity when called with one argument', () => {
    const myMin = tgpu.fn([d.f32], d.f32)((a: number) => {
      'use gpu';
      return std.min(a);
    });

    expect(myMin(6)).toBe(6);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: f32) -> f32 {
        return a;
      }"
    `);
  });

  it('works with two arguments', () => {
    const myMin = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => {
      'use gpu';
      return std.min(a, b);
    });

    expect(myMin(1, 2)).toBe(1);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: f32, b: f32) -> f32 {
        return min(a, b);
      }"
    `);
  });

  it('works with multiple arguments', () => {
    const myMin = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)(
      (a, b, c, d) => {
        'use gpu';
        return std.min(a, b, c, d);
      },
    );

    expect(myMin(2, 1, 4, 5)).toBe(1);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: f32, b: f32, c: f32, d2: f32) -> f32 {
        return min(min(min(a, b), c), d2);
      }"
    `);
  });

  it('unifies arguments', () => {
    const myMin = tgpu.fn([], d.f32)(() => {
      'use gpu';
      const a = d.u32(9);
      const b = d.i32(1);
      const c = d.f32(4);
      return std.min(a, b, 3.3, c, 7);
    });

    expect(myMin()).toBe(1);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin() -> f32 {
        const a = 9u;
        const b = 1i;
        const c = 4f;
        return min(min(min(min(f32(a), f32(b)), 3.3f), c), 7f);
      }"
    `);
  });

  it('works with vectors', () => {
    const myMin = tgpu.fn([d.vec3u, d.vec3u], d.vec3u)((a, b) => {
      'use gpu';
      return std.min(a, b);
    });

    expect(myMin(d.vec3u(1, 2, 3), d.vec3u(3, 2, 1)))
      .toStrictEqual(d.vec3u(1, 2, 1));
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: vec3u, b: vec3u) -> vec3u {
        return min(a, b);
      }"
    `);
  });

  it('does comptime reduction', () => {
    const myMin = tgpu.fn([], d.u32)(() => {
      'use gpu';
      return std.min(33, 12, 444, 12333);
    });

    expect(myMin()).toBe(12);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin() -> u32 {
        return 12u;
      }"
    `);
  });

  it('cannot be called with invalid arguments', () => {
    // @ts-expect-error
    (() => std.min());
    // @ts-expect-error
    (() => std.min(1, d.vec2f()));
    // @ts-expect-error
    (() => std.min(d.vec3f(), d.vec2f()));
  });
});
