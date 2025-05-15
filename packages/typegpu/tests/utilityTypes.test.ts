import { describe, expectTypeOf, it } from 'vitest';
import type { Default, Mutable } from '../src/shared/utilityTypes.ts';
import type * as d from '../src/data/index.ts';
import type { ExtractTypeLabel } from '../src/data/wgslTypes.ts';

describe('Default', () => {
  it('turns undefined into the default', () => {
    expectTypeOf<Default<undefined, 'example'>>().toEqualTypeOf<'example'>();
  });

  it('turns an undefined union member into the default', () => {
    expectTypeOf<Default<undefined | number, 'example'>>().toEqualTypeOf<
      'example' | number
    >();
  });

  it('leaves a defined value untouched', () => {
    expectTypeOf<Default<number | string, 'example'>>().toEqualTypeOf<
      number | string
    >();
  });
});

describe('Mutable', () => {
  it('works on tuples', () => {
    expectTypeOf<Mutable<readonly [1, 2, 3]>>().toEqualTypeOf<[1, 2, 3]>();
  });

  it('works on unions of tuples', () => {
    expectTypeOf<
      Mutable<readonly [1, 2, 3] | readonly [1, 2, 3, 4]>
    >().toEqualTypeOf<[1, 2, 3] | [1, 2, 3, 4]>();
  });
});

describe('ExtractTypeLabel', () => {
  it('works on numeric types', () => {
    expectTypeOf<ExtractTypeLabel<d.U32>>().toEqualTypeOf<'u32'>();
    expectTypeOf<ExtractTypeLabel<d.I32>>().toEqualTypeOf<'i32'>();
    expectTypeOf<ExtractTypeLabel<d.F32>>().toEqualTypeOf<'f32'>();
    expectTypeOf<ExtractTypeLabel<d.F16>>().toEqualTypeOf<'f16'>();
  });

  it('works on vec types', () => {
    expectTypeOf<ExtractTypeLabel<d.Vec2b>>().toEqualTypeOf<'vec2<bool>'>();
    expectTypeOf<ExtractTypeLabel<d.Vec3f>>().toEqualTypeOf<'vec3f'>();
    expectTypeOf<ExtractTypeLabel<d.Vec4h>>().toEqualTypeOf<'vec4h'>();
    expectTypeOf<ExtractTypeLabel<d.Vec2i>>().toEqualTypeOf<'vec2i'>();
    expectTypeOf<ExtractTypeLabel<d.Vec3u>>().toEqualTypeOf<'vec3u'>();
  });

  it('works on compound types', () => {
    expectTypeOf<ExtractTypeLabel<d.WgslArray<d.Vec2f>>>().toEqualTypeOf<
      'array'
    >();
    expectTypeOf<ExtractTypeLabel<d.WgslStruct<{ prop: d.Vec2f }>>>()
      .toEqualTypeOf<
        'struct'
      >();
  });
});
