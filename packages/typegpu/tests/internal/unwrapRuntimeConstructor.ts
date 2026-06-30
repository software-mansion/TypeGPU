import { describe, expectTypeOf, it } from 'vitest';
import { d } from 'typegpu';
import type { UnwrapRuntimeConstructor } from '../../src/tgpuBindGroupLayout.ts';

describe('UnwrapRuntimeConstructor', () => {
  it('unwraps return types of functions returning TgpuData', () => {
    expectTypeOf<UnwrapRuntimeConstructor<d.U32>>().toEqualTypeOf<d.U32>();
    expectTypeOf<UnwrapRuntimeConstructor<d.WgslArray<d.Vec3f>>>().toEqualTypeOf<
      d.WgslArray<d.Vec3f>
    >();
    expectTypeOf<UnwrapRuntimeConstructor<(_: number) => d.WgslArray<d.Vec3f>>>().toEqualTypeOf<
      d.WgslArray<d.Vec3f>
    >();

    expectTypeOf<UnwrapRuntimeConstructor<d.F32 | ((_: number) => d.U32)>>().toEqualTypeOf<
      d.F32 | d.U32
    >();
  });
});
