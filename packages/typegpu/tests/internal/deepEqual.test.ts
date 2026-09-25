import { describe, expect, it } from 'vitest';
import { deepEqual, f32, ptrPrivate } from 'typegpu/data';
import { implicitFrom } from '../../src/data/ptr.ts';

describe('deepEqual', () => {
  it('distinguishes implicit pointers from explicit ones', () => {
    const ptr = ptrPrivate(f32);

    expect(deepEqual(ptr, implicitFrom(ptr))).toBe(false);
    expect(deepEqual(implicitFrom(ptr), implicitFrom(ptrPrivate(f32)))).toBe(true);
  });
});
