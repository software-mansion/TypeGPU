import { describe, expectTypeOf, it } from 'vitest';
import type { Default } from '../src/utilityTypes';

describe('Default', () => {
  it('turns undefined into the default', () => {
    expectTypeOf<Default<undefined, 'example'>>().toEqualTypeOf<'example'>();
  });

  it('turns an undefined union member into the default', () => {
    expectTypeOf<Default<undefined | number, 'example'>>().toEqualTypeOf<
      'example' | number
    >();
  });

  it('leaves a defined value untouched', () => {
    expectTypeOf<Default<number | string, 'example'>>().toEqualTypeOf<
      number | string
    >();
  });
});
