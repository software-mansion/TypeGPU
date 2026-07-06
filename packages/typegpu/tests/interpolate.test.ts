import { describe, expect, expectTypeOf, it } from 'vitest';
import { tgpu, d } from 'typegpu';

describe('d.interpolate', () => {
  it('adds @interpolate (only interpolation type) attribute for struct members', () => {
    const s1 = d.struct({
      a: d.u32,
      b: d.interpolate('flat', d.u32),
      c: d.u32,
    });

    expectTypeOf(s1).toEqualTypeOf<
      d.WgslStruct<{
        a: d.U32;
        b: d.Decorated<d.U32, [d.Interpolate<'flat'>]>;
        c: d.U32;
      }>
    >();

    expect(tgpu.resolve([s1])).toContain('@interpolate(flat) b: u32,');
  });

  it('adds @interpolate (with interpolation type and sampling method) attribute for struct members', () => {
    const s1 = d.struct({
      a: d.u32,
      b: d.interpolate('linear, sample', d.f32),
      c: d.u32,
    });

    expectTypeOf(s1).toEqualTypeOf<
      d.WgslStruct<{
        a: d.U32;
        b: d.Decorated<d.F32, [d.Interpolate<'linear, sample'>]>;
        c: d.U32;
      }>
    >();

    // @ts-expect-error integer values can't interpolate
    d.interpolate('linear, sample', d.u32);
    // @ts-expect-error integer values can't interpolate
    d.interpolate('linear, sample', d.i32);

    expect(tgpu.resolve([s1])).toContain('@interpolate(linear, sample) b: f32,');
  });
});
