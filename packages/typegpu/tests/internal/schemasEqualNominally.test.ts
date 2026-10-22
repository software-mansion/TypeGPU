import { describe, expect, it } from 'vitest';
import { schemasEqualNominally, f32, ptrPrivate } from 'typegpu/data';
import { implicitFrom } from '../../src/data/ptr.ts';

describe('schemasEqualNominally', () => {
  it('distinguishes implicit pointers from explicit ones', () => {
    const ptr = ptrPrivate(f32);

    expect(schemasEqualNominally(ptr, implicitFrom(ptr))).toBe(false);
    expect(schemasEqualNominally(implicitFrom(ptr), implicitFrom(ptrPrivate(f32)))).toBe(true);
  });
});
