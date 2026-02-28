import { describe, expectTypeOf, it } from 'vitest';
import type { Default, Mutable } from '../src/shared/utilityTypes.ts';

describe('Default', () => {
  it('turns undefined into the default', () => {
    expectTypeOf<Default<undefined, 'example'>>().toEqualTypeOf<'example'>();
  });

  it('turns an undefined union member into the default', () => {
    expectTypeOf<Default<undefined | number, 'example'>>().toEqualTypeOf<'example' | number>();
  });

  it('leaves a defined value untouched', () => {
    expectTypeOf<Default<number | string, 'example'>>().toEqualTypeOf<number | string>();
  });
});

describe('Mutable', () => {
  it('works on tuples', () => {
    expectTypeOf<Mutable<readonly [1, 2, 3]>>().toEqualTypeOf<[1, 2, 3]>();
  });

  it('works on unions of tuples', () => {
    expectTypeOf<Mutable<readonly [1, 2, 3] | readonly [1, 2, 3, 4]>>().toEqualTypeOf<
      [1, 2, 3] | [1, 2, 3, 4]
    >();
  });
});
