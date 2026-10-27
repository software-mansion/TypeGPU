import { describe, expect, expectTypeOf, it } from 'vitest';
import { d, tgpu } from 'typegpu';

describe('attributes', () => {
  it('adds attributes in the correct order', () => {
    const s1 = d.struct({
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

  it('replaces an attribute of the same kind instead of repeating it', () => {
    const s1 = d.struct({
      a: d.align(16, d.align(8, d.u32)),
      b: d.size(16, d.align(8, d.size(8, d.u32))),
    });

    const wgsl = tgpu.resolve([s1]);
    expect(wgsl).toContain('@align(16) a: u32,');
    expect(wgsl).toContain('@size(16) @align(8) b: u32,');

    expectTypeOf(s1).toEqualTypeOf<
      d.WgslStruct<{
        a: d.Decorated<d.U32, [d.Align<16>]>;
        b: d.Decorated<d.U32, [d.Size<16>, d.Align<8>]>;
      }>
    >();
  });
});
