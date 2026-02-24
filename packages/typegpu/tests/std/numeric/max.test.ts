import { describe, expect, it } from 'vitest';
import tgpu, { d, std } from '../../../src/index.js';

describe('max', () => {
  it('acts as identity when called with one argument', () => {
    const myMax = tgpu.fn([d.f32], d.f32)((a: number) => {
      'use gpu';
      return std.max(a);
    });

    expect(myMax(6)).toBe(6);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax(a: f32) -> f32 {
        return a;
      }"
    `);
  });

  it('works with two arguments', () => {
    const myMax = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => {
      'use gpu';
      return std.max(a, b);
    });

    expect(myMax(1, 2)).toBe(2);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax(a: f32, b: f32) -> f32 {
        return max(a, b);
      }"
    `);
  });

  it('works with multiple arguments', () => {
    const myMax = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)(
      (a, b, c, d) => {
        'use gpu';
        return std.max(a, b, c, d);
      },
    );

    expect(myMax(2, 1, 4, 5)).toBe(5);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax(a: f32, b: f32, c: f32, d2: f32) -> f32 {
        return max(max(max(a, b), c), d2);
      }"
    `);
  });

  it('unifies arguments', () => {
    const myMax = tgpu.fn([], d.f32)(() => {
      'use gpu';
      const a = d.u32(9);
      const b = d.i32(1);
      const c = d.f32(4);
      return std.max(a, b, 3.3, c, 7);
    });

    expect(myMax()).toBe(9);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax() -> f32 {
        const a = 9u;
        const b = 1i;
        const c = 4f;
        return max(max(max(max(f32(a), f32(b)), 3.3f), c), 7f);
      }"
    `);
  });

  it('works with vectors', () => {
    const myMax = tgpu.fn([d.vec3u, d.vec3u], d.vec3u)((a, b) => {
      'use gpu';
      return std.max(a, b);
    });

    expect(myMax(d.vec3u(1, 2, 3), d.vec3u(3, 2, 1)))
      .toStrictEqual(d.vec3u(3, 2, 3));
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax(a: vec3u, b: vec3u) -> vec3u {
        return max(a, b);
      }"
    `);
  });

  it('does comptime reduction', () => {
    const myMax = tgpu.fn([], d.u32)(() => {
      'use gpu';
      return std.max(12, 33, 12333, 444);
    });

    expect(myMax()).toBe(12333);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax() -> u32 {
        return 12333u;
      }"
    `);
  });

  it('cannot be called with invalid arguments', () => {
    // @ts-expect-error
    (() => std.max());
    // @ts-expect-error
    (() => std.max(1, d.vec2f()));
    // @ts-expect-error
    (() => std.max(d.vec3f(), d.vec2f()));
  });
});
