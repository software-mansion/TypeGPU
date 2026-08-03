import { describe, expectTypeOf } from 'vitest';
import { d } from 'typegpu';
import type { IsValidBufferSchema, IsValidUniformSchema } from '../../src/shared/repr.ts';
import { it } from 'typegpu-testing-utility';

describe('IsValidUniformSchema', () => {
  it('treats booleans as invalid', () => {
    expectTypeOf<IsValidUniformSchema<d.Bool>>().toEqualTypeOf<false>();
  });

  it('treats numeric schemas as valid', () => {
    expectTypeOf<IsValidUniformSchema<d.U32>>().toEqualTypeOf<true>();
  });

  it('it treats union schemas as valid (even if they contain booleans)', () => {
    expectTypeOf<IsValidUniformSchema<d.U32 | d.Bool>>().toEqualTypeOf<true>();
    expectTypeOf<IsValidUniformSchema<d.U32 | d.WgslArray<d.Bool>>>().toEqualTypeOf<true>();
    expectTypeOf<IsValidUniformSchema<d.WgslArray<d.Bool | d.U32>>>().toEqualTypeOf<true>();
  });
});

describe('IsValidBufferSchema', () => {
  it('treats booleans as invalid', () => {
    expectTypeOf<IsValidBufferSchema<d.Bool>>().toEqualTypeOf<false>();
  });

  it('treats schemas holding booleans as invalid', () => {
    expectTypeOf<IsValidBufferSchema<d.WgslArray<d.Bool>>>().toEqualTypeOf<false>();
    expectTypeOf<IsValidBufferSchema<d.WgslStruct<{ a: d.Bool }>>>().toEqualTypeOf<false>();
  });

  it('treats other schemas as valid', () => {
    expectTypeOf<IsValidBufferSchema<d.U32>>().toEqualTypeOf<true>();
  });

  it('it treats arrays of valid schemas as valid', () => {
    expectTypeOf<IsValidBufferSchema<d.WgslArray<d.U32>>>().toEqualTypeOf<true>();
  });

  it('it treats union schemas as valid (even if they contain booleans)', () => {
    expectTypeOf<IsValidBufferSchema<d.U32 | d.Bool>>().toEqualTypeOf<true>();
    expectTypeOf<IsValidBufferSchema<d.U32 | d.WgslArray<d.Bool>>>().toEqualTypeOf<true>();
    expectTypeOf<IsValidBufferSchema<d.WgslArray<d.Bool | d.U32>>>().toEqualTypeOf<true>();
  });
});
