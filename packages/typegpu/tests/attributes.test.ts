import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from '../src/data';
import { StrictNameRegistry } from '../src/nameRegistry';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('attributes', () => {
  it('adds attributes in the correct order', () => {
    const s1 = d
      .struct({
        a: d.u32,
        b: d.size(8, d.align(16, d.u32)),
        c: d.u32,
      })
      .$name('s1');

    const resolutionCtx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });

    expect(resolutionCtx.resolve(s1)).toContain('@size(8) @align(16) b: u32,');

    expectTypeOf(s1).toEqualTypeOf<
      d.TgpuStruct<{
        a: d.U32;
        b: d.Decorated<d.U32, [d.Size<8>, d.Align<16>]>;
        c: d.U32;
      }>
    >();
  });
});
