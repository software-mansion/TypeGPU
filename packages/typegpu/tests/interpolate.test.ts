import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from '../src/data/index.ts';
import { namespace } from '../src/core/resolve/namespace.ts';
import { resolve } from '../src/resolutionCtx.ts';

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

    const opts = {
      namespace: namespace({ names: 'strict' }),
    };

    expect(resolve(s1, opts).code).toContain('@interpolate(flat) b: u32,');
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

    const opts = {
      namespace: namespace({ names: 'strict' }),
    };

    expect(resolve(s1, opts).code).toContain('@interpolate(linear, sample) b: f32,');
  });
});
