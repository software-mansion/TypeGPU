import { describe, expect, expectTypeOf, it } from 'vitest';
import { d, tgpu } from '../src/index.js';

describe('attributes', () => {
  it('adds attributes in the correct order', () => {
    const s1 = d
      .struct({
        a: d.u32,
        b: d.size(8, d.align(16, d.u32)),
        c: d.u32,
      });

    expect(tgpu.resolve([s1])).toContain('@size(8) @align(16) b: u32,');

    expectTypeOf(s1).toEqualTypeOf<
      d.WgslStruct<{
        a: d.U32;
        b: d.Decorated<d.U32, [d.Size<8>, d.Align<16>]>;
        c: d.U32;
      }>
    >();
  });
});
