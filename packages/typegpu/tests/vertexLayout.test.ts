import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ArrayToContainedAttribs } from '../src/core/vertexLayout/vertexAttribute';
import * as d from '../src/data';
import tgpu from '../src/experimental';
import type { TgpuVertexAttrib } from '../src/shared/vertexFormat';

describe('ArrayToContainedAttribs', () => {
  it('processes a loose array of uint8x2', () => {
    type Result = ArrayToContainedAttribs<d.TgpuLooseArray<d.uint8x2>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'uint8x2'>>();
  });

  it('processes a loose array of unorm10_10_10_2', () => {
    type Result = ArrayToContainedAttribs<d.TgpuLooseArray<d.unorm10_10_10_2>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'unorm10_10_10_2'>>();
  });

  it('processes an array of u32s', () => {
    type Result = ArrayToContainedAttribs<d.TgpuArray<d.U32>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'uint32'>>();
  });

  it('processes a loose array of f32s', () => {
    type Result = ArrayToContainedAttribs<d.TgpuLooseArray<d.F32>>;

    expectTypeOf<Result>().toEqualTypeOf<TgpuVertexAttrib<'float32'>>();
  });

  it('processes a loose array of structs', () => {
    type Result = ArrayToContainedAttribs<
      d.TgpuLooseArray<d.TgpuStruct<{ a: d.F32; b: d.F32 }>>
    >;

    expectTypeOf<Result>().toEqualTypeOf<{
      a: TgpuVertexAttrib<'float32'>;
      b: TgpuVertexAttrib<'float32'>;
    }>();
  });

  it('processes a loose array of loose struct', () => {
    type Result = ArrayToContainedAttribs<
      d.TgpuLooseArray<d.TgpuLooseStruct<{ a: d.F32; b: d.F32 }>>
    >;

    expectTypeOf<Result>().toEqualTypeOf<{
      a: TgpuVertexAttrib<'float32'>;
      b: TgpuVertexAttrib<'float32'>;
    }>();
  });

  it('processes an array of structs', () => {
    type Result = ArrayToContainedAttribs<
      d.TgpuLooseArray<d.TgpuLooseStruct<{ a: d.F32; b: d.F32 }>>
    >;

    expectTypeOf<Result>().toEqualTypeOf<{
      a: TgpuVertexAttrib<'float32'>;
      b: TgpuVertexAttrib<'float32'>;
    }>();
  });
});

describe('tgpu.vertexLayout', () => {
  it('creates attributes from loose array of vec3f', () => {
    const vertexLayout = tgpu.vertexLayout((count: number) =>
      d.looseArrayOf(d.vec3f, count),
    );

    expect(vertexLayout.stride).toEqual(12);
    expect(vertexLayout.attrib).toEqual({
      layout: vertexLayout,
      format: 'float32x3',
      offset: 0,
    });
  });

  it('creates attributes from loose array of structs', () => {
    const VertexData = d.struct({
      a: d.u32, // +16 (12 bytes of padding)
      b: d.vec3f, // + 12
      c: d.f32, // + 4
    });

    const vertexLayout = tgpu.vertexLayout((count: number) =>
      d.looseArrayOf(VertexData, count),
    );

    expect(vertexLayout.stride).toEqual(32);
    expect(vertexLayout.attrib).toEqual({
      a: {
        layout: vertexLayout,
        format: 'uint32',
        offset: 0,
      },
      b: {
        layout: vertexLayout,
        format: 'float32x3',
        offset: 16,
      },
      c: {
        layout: vertexLayout,
        format: 'float32',
        offset: 28,
      },
    });
  });

  it('creates attributes from loose array of loose structs', () => {
    const VertexData = d.looseStruct({
      a: d.u32, // +4
      b: d.vec3f, // + 12
      c: d.f32, // + 4
    });

    const vertexLayout = tgpu.vertexLayout((count: number) =>
      d.looseArrayOf(VertexData, count),
    );

    expect(vertexLayout.stride).toEqual(20);
    expect(vertexLayout.attrib).toEqual({
      a: {
        layout: vertexLayout,
        format: 'uint32',
        offset: 0,
      },
      b: {
        layout: vertexLayout,
        format: 'float32x3',
        offset: 4,
      },
      c: {
        layout: vertexLayout,
        format: 'float32',
        offset: 16,
      },
    });
  });
});
