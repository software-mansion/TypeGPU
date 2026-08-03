import { describe, expectTypeOf, it } from 'vitest';
import { d } from 'typegpu';
import type { OmitBuiltins } from '../../src/builtin.ts';

describe('builtin', () => {
  it('can be omitted from a record type', () => {
    const x = {
      a: d.u32,
      b: d.builtin.localInvocationId,
      c: d.f32,
      d: d.builtin.localInvocationIndex,
    };

    type X = typeof x;
    type Omitted = OmitBuiltins<X>;

    expectTypeOf<Omitted>().toEqualTypeOf({
      a: d.u32,
      c: d.f32,
    });
  });
});
