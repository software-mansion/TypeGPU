import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from '../src/data';
import { StrictNameRegistry } from '../src/experimental';
import { resolve } from '../src/resolutionCtx';

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
      d.TgpuStruct<{
        a: d.U32;
        b: d.Decorated<d.U32, [d.Location<3>]>;
        c: d.U32;
      }>
    >();

    const opts = {
      names: new StrictNameRegistry(),
    };

    expect(resolve(s1, opts).code).toContain('@location(3) b: u32,');
  });
});
