import { describe, expect, it } from 'vitest';
import { schemasEqualStructurally, f32, ptrPrivate } from 'typegpu/data';
import { implicitFrom } from '../../src/data/ptr.ts';

describe('schemasEqualStructurally', () => {
  it('distinguishes implicit pointers from explicit ones', () => {
    const ptr = ptrPrivate(f32);

    expect(schemasEqualStructurally(ptr, implicitFrom(ptr))).toBe(false);
    expect(schemasEqualStructurally(implicitFrom(ptr), implicitFrom(ptrPrivate(f32)))).toBe(true);
  });
});
