import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';
import { vec2f, vec3f, vec4f } from 'typegpu/data';
import { atan2, isCloseTo } from 'typegpu/std';

describe('atan2', () => {
  it('computes atan2 of two values', () => {
    expect(atan2(0, 1)).toBeCloseTo(0);
    expect(atan2(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(atan2(0, -1)).toBeCloseTo(Math.PI);
    expect(atan2(-1, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('computes atan2 for two vectors', () => {
    expect(
      isCloseTo(
        atan2(vec4f(0, 1, 0, -1), vec4f(1, 0, -1, 0)),
        vec4f(0, Math.PI / 2, Math.PI, -Math.PI / 2),
      ),
    ).toBe(true);
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => atan2(vec2f(), vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f'.]`,
    );
  });

  it('explains when arguments are supported, but have no common type', () => {
    const mixedPrecision = () => {
      'use gpu';
      // @ts-expect-error
      return std.atan2(d.vec3h(1, 2, 3), d.vec3f(1, 2, 3));
    };

    expect(() => tgpu.resolve([mixedPrecision])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:mixedPrecision
      - fn*:mixedPrecision()
      - fn:atan2: Data types vec3h, vec3f cannot be used together, because they have no common type. Convert them explicitly to the same type. Supported types are: f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.]
    `);
  });

  it('points out which arguments are unsupported', () => {
    const intArg = () => {
      'use gpu';
      // @ts-expect-error
      return std.atan2(d.vec3f(1, 2, 3), d.vec3u(1, 2, 3));
    };

    expect(() => tgpu.resolve([intArg])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:intArg
      - fn*:intArg()
      - fn:atan2: Unsupported data types: vec3u. Supported types are: f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.]
    `);
  });
});
