import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('clamp', () => {
  it('clamps scalars', () => {
    expect(std.clamp(5, 0, 1)).toBe(1);
    expect(std.clamp(-5, 0, 1)).toBe(0);
    expect(std.clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('clamps vectors component-wise', () => {
    expect(std.clamp(d.vec2f(5, -5), d.vec2f(0), d.vec2f(1))).toStrictEqual(d.vec2f(1, 0));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.clamp(d.vec2f(), d.vec3f(), d.vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f'.]`,
    );
  });
});
