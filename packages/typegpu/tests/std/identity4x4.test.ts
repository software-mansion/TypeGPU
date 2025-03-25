import { describe, expect, it } from 'vitest';
import { identity4x4 } from '../../src/std';
import { mat4x4f } from '../../src/data/matrix';
import { vec4f } from '../../src/data';

describe('identity', () => {
  it('returns identity matrix of size 4x4', () => {
    expect(identity4x4()).toEqual(
      mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
    );
  });

  it('returns identity matrix of size 4x4', () => {
    expect(identity4x4()).toEqual(
      mat4x4f(
        vec4f(1, 0, 0, 0),
        vec4f(0, 1, 0, 0),
        vec4f(0, 0, 1, 0),
        vec4f(0, 0, 0, 1),
      ),
    );
  });
});
