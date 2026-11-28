import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';
import { vec2f, vec3f } from 'typegpu/data';
import { dot } from 'typegpu/std';

describe('dot', () => {
  it('computes dot product of two vec2f', () => {
    expect(dot(vec2f(0, 0), vec2f(0, 0))).toBe(0);
    expect(dot(vec2f(1, 0), vec2f(1, 0))).toBe(1);
    expect(dot(vec2f(-1, 1), vec2f(1, 0))).toBe(-1);
  });

  it('computes dot product of two vec3f', () => {
    expect(dot(vec3f(0, 0, 0), vec3f(0, 1, 0))).toBe(0);
    expect(dot(vec3f(1, 0, 0), vec3f(1, 0, 0))).toBe(1);
    expect(dot(vec3f(-1, 1, 0), vec3f(1, 0, 1))).toBe(-1);
  });

  it('dot of the same vec2f is its length squared', () => {
    const v1 = vec2f(2, 2);
    const v2 = vec2f(-1, 1);

    expect(dot(v1, v1)).toBe(8);
    expect(dot(v2, v2)).toBe(2);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => dot(vec2f(), vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f'.]`,
    );
    // @ts-expect-error
    expect(() => dot(1, vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected kind to not be scalar, got 'number'.]`,
    );
  });

  it('accepts vectors of the same type on the GPU', () => {
    const main = () => {
      'use gpu';
      const a = d.vec3f(1, 2, 3);
      const b = d.vec3i(1, 2, 3);
      return dot(a, d.vec3f(1)) + d.f32(dot(b, b));
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        let a = vec3f(1, 2, 3);
        let b = vec3i(1, 2, 3);
        return (dot(a, vec3f(1)) + f32(dot(b, b)));
      }"
    `);
  });

  it('rejects vectors of different types on the GPU', () => {
    const mixedSigns = () => {
      'use gpu';
      const a = d.vec3f(1, 2, 3);
      const b = d.vec3i(1, 2, 3);
      // @ts-expect-error
      return dot(a, b);
    };

    const mixedPrecision = () => {
      'use gpu';
      const a = d.vec3h(1, 2, 3);
      const b = d.vec3f(1, 2, 3);
      // @ts-expect-error
      return dot(a, b);
    };

    expect(() => tgpu.resolve([mixedSigns])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:mixedSigns
      - fn*:mixedSigns()
      - fn:dot: Unsupported data types: vec3f, vec3i. Supported types are: vec2f, vec3f, vec4f, vec2h, vec3h, vec4h, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u.]
    `);
    expect(() => tgpu.resolve([mixedPrecision])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:mixedPrecision
      - fn*:mixedPrecision()
      - fn:dot: Unsupported data types: vec3h, vec3f. Supported types are: vec2f, vec3f, vec4f, vec2h, vec3h, vec4h, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u.]
    `);
  });
});
