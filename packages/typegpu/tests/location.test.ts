import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from '../src/data/index.ts';
import { namespace } from '../src/core/resolve/namespace.ts';
import { resolve } from '../src/resolutionCtx.ts';

describe('d.location', () => {
  it('adds @location attribute for struct members', () => {
    const s1 = d
      .struct({
        a: d.u32,
        b: d.location(3, d.u32),
        c: d.u32,
      })
      .$name('s1');

    expectTypeOf(s1).toEqualTypeOf<
      d.WgslStruct<{
        a: d.U32;
        b: d.Decorated<d.U32, [d.Location<3>]>;
        c: d.U32;
      }>
    >();

    const opts = {
      namespace: namespace({ names: 'strict' }),
    };

    expect(resolve(s1, opts).code).toContain('@location(3) b: u32,');
  });
});

describe('d.HasCustomLocation', () => {
  it('determines if a type has any location attributes', () => {
    const schemaWithLocation = d.location(5, d.u32);
    expectTypeOf<d.HasCustomLocation<typeof schemaWithLocation>>().toEqualTypeOf<true>();

    const schemaWithoutLocation = d.size(32, d.u32);
    expectTypeOf<d.HasCustomLocation<typeof schemaWithoutLocation>>().toEqualTypeOf<false>();

    const builtin = d.builtin.clipDistances;
    expectTypeOf<d.HasCustomLocation<typeof builtin>>().toEqualTypeOf<false>();
  });
});
