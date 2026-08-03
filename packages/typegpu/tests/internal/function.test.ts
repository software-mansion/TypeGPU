import { attest } from '@ark/attest';
import { describe, expectTypeOf, it } from 'vitest';
import type { InferIO, InheritArgNames, IOLayout } from '../../src/core/function/fnTypes.ts';
import { d } from 'typegpu';
import type { Prettify } from '../../src/shared/utilityTypes.ts';

describe('InferIO', () => {
  it('unwraps f32', () => {
    const layout = d.f32 satisfies IOLayout;

    expectTypeOf<InferIO<typeof layout>>().toEqualTypeOf<number>();
  });

  it('unwraps a record of numeric primitives', () => {
    const layout = { a: d.f32, b: d.location(2, d.u32) } satisfies IOLayout;

    expectTypeOf<InferIO<typeof layout>>().toEqualTypeOf<{
      a: number;
      b: number;
    }>();
  });
});

describe('InheritArgNames', () => {
  it('should inherit argument names from one fn to another', () => {
    const isEven = (x: number) => (x & 1) === 0;
    const identity = (num: number) => num;
    // Should have the same argument names as `identity`, but the signature of `isEven`
    const isEvenWithNames = undefined as unknown as Prettify<
      InheritArgNames<typeof isEven, typeof identity>
    >['result'];

    attest(isEven).type.toString.snap('(x: number) => boolean');
    attest(identity).type.toString.snap('(num: number) => number');
    attest(isEvenWithNames).type.toString.snap('(num: number) => boolean');
  });
});
