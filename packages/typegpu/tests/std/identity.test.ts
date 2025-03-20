import { mat4x4f } from 'packages/typegpu/src/data';
import { identity } from 'packages/typegpu/src/std';
import { describe, expect, it } from 'vitest';

describe('identity', () => {
  it('returns identity matrix if size 4x4', () => {
    expect(identity()).toEqual(mat4x4f(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ));
  });
});
