import { mat4x4f, vec4f } from 'packages/typegpu/src/data';
import { identity } from 'packages/typegpu/src/std';
import { describe, expect, it } from 'vitest';

describe('identity', () => {
  it('returns identity matrix of size 4x4', () => {
    expect(identity()).toEqual(
      mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
    );
  });

  it('returns identity matrix of size 4x4', () => {
    expect(identity()).toEqual(
      mat4x4f(
        vec4f(1, 0, 0, 0),
        vec4f(0, 1, 0, 0),
        vec4f(0, 0, 1, 0),
        vec4f(0, 0, 0, 1),
      ),
    );
  });
});
