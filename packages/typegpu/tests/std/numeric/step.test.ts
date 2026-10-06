import { describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('step', () => {
  it('compares scalars', () => {
    expect(std.step(2, 3)).toBe(1);
    expect(std.step(2, 2)).toBe(1);
    expect(std.step(2, 1)).toBe(0);
  });

  it('works with scalar edge and vector argument', () => {
    expect(std.step(0.5, d.vec2f(0.3, 0.7))).toEqual(d.vec2f(0, 1));
    expect(std.step(1.5, d.vec3f(1.0, 1.5, 2.0))).toEqual(d.vec3f(0, 1, 1));
    expect(std.step(0.0, d.vec4f(-1.0, 0.0, 0.5, 1.0))).toEqual(d.vec4f(0, 1, 1, 1));
  });

  it('works with vector arguments', () => {
    expect(std.step(d.vec2f(0.5, 0.8), d.vec2f(0.6, 0.7))).toEqual(d.vec2f(1, 0));
    expect(std.step(d.vec3f(1, 2, 3), d.vec3f(2, 2, 1))).toEqual(d.vec3f(1, 1, 0));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.step(d.vec2f(), 2)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, number'.]`,
    );

    // @ts-expect-error
    expect(() => std.step(d.vec2f(), d.vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f'.]`,
    );
  });

  it('resolves in shader code with scalar edge', () => {
    const fn1 = tgpu.fn([d.vec2f], d.vec2f)((v) => {
      'use gpu';
      return std.step(0.5, v);
    });
    expect(tgpu.resolve([fn1])).toContain('return step(vec2f(0.5f), v);');

    const fn2 = tgpu.fn([d.f32, d.vec2f], d.vec2f)((edge, v) => {
      'use gpu';
      return std.step(edge, v);
    });
    expect(tgpu.resolve([fn2])).toContain('return step(vec2f(edge), v);');
  });

  it('resolves in shader code with vector edge', () => {
    const fn = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((edge, v) => {
      'use gpu';
      return std.step(edge, v);
    });
    expect(tgpu.resolve([fn])).toContain('return step(edge, v);');
  });
});

