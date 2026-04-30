import { describe, expectTypeOf, it } from 'vitest';
import type { d } from '../../src/index.js';
import type { ArrayToContainedAttribs } from '../../src/core/vertexLayout/vertexAttribute.ts';
import type { TgpuVertexAttrib } from '../../src/shared/vertexFormat.ts';

describe('ArrayToContainedAttribs', () => {
  it('processes a loose array of uint8x2', () => {
    type Result = ArrayToContainedAttribs<d.Disarray<d.uint8x2>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'uint8x2'>>();
  });

  it('processes a loose array of unorm10-10-10-2', () => {
    type Result = ArrayToContainedAttribs<d.Disarray<d.unorm10_10_10_2>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'unorm10-10-10-2'>>();
  });

  it('processes an array of u32s', () => {
    type Result = ArrayToContainedAttribs<d.WgslArray<d.U32>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'uint32'>>();
  });

  it('processes a loose array of f32s', () => {
    type Result = ArrayToContainedAttribs<d.Disarray<d.F32>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'float32'>>();
  });

  it('processes a loose array of structs', () => {
    type Result = ArrayToContainedAttribs<d.Disarray<d.WgslStruct<{ a: d.F32; b: d.F32 }>>>;

    expectTypeOf<Result>().toEqualTypeOf<{
      a: TgpuVertexAttrib<'float32'>;
      b: TgpuVertexAttrib<'float32'>;
    }>();
  });

  it('processes a loose array of loose struct', () => {
    type Result = ArrayToContainedAttribs<d.Disarray<d.Unstruct<{ a: d.F32; b: d.F32 }>>>;

    expectTypeOf<Result>().toEqualTypeOf<{
      a: TgpuVertexAttrib<'float32'>;
      b: TgpuVertexAttrib<'float32'>;
    }>();
  });

  it('processes an array of structs', () => {
    type Result = ArrayToContainedAttribs<d.Disarray<d.Unstruct<{ a: d.F32; b: d.F32 }>>>;

    expectTypeOf<Result>().toEqualTypeOf<{
      a: TgpuVertexAttrib<'float32'>;
      b: TgpuVertexAttrib<'float32'>;
    }>();
  });

  it('processes an array of f16s', () => {
    type Result = ArrayToContainedAttribs<d.WgslArray<d.F16>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'float16'>>();
  });

  it('processes a loose array of snorm16x2', () => {
    type Result = ArrayToContainedAttribs<d.Disarray<d.snorm16x2>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'snorm16x2'>>();
  });
});
