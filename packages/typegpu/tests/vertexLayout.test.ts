import { describe, expect, expectTypeOf, it } from 'vitest';
import { connectAttributesToShader } from '../src/core/vertexLayout/connectAttributesToShader.ts';
import type { ArrayToContainedAttribs } from '../src/core/vertexLayout/vertexAttribute.ts';
import tgpu, { d } from '../src/index.js';
import type { TgpuVertexAttrib } from '../src/shared/vertexFormat.ts';

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

describe('tgpu.vertexLayout', () => {
  it('creates attributes from loose array of vec3f', () => {
    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(d.vec3f, count));

    expect(vertexLayout.stride).toBe(12);
    expect(vertexLayout.attrib).toStrictEqual({
      _layout: vertexLayout,
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

    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(VertexData, count));

    expect(vertexLayout.stride).toBe(32);
    expect(vertexLayout.attrib).toStrictEqual({
      a: {
        _layout: vertexLayout,
        format: 'uint32',
        offset: 0,
      },
      b: {
        _layout: vertexLayout,
        format: 'float32x3',
        offset: 16,
      },
      c: {
        _layout: vertexLayout,
        format: 'float32',
        offset: 28,
      },
    });
  });

  it('creates attributes from loose array of loose structs', () => {
    const VertexData = d.unstruct({
      a: d.u32, // +4
      b: d.vec3f, // + 12
      c: d.f32, // + 4
    });

    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(VertexData, count));

    expect(vertexLayout.stride).toBe(20);
    expect(vertexLayout.attrib).toStrictEqual({
      a: {
        _layout: vertexLayout,
        format: 'uint32',
        offset: 0,
      },
      b: {
        _layout: vertexLayout,
        format: 'float32x3',
        offset: 4,
      },
      c: {
        _layout: vertexLayout,
        format: 'float32',
        offset: 16,
      },
    });
  });

  it('creates attributes from loose array with f16 variants', () => {
    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(d.float16x4, count));

    expect(vertexLayout.stride).toBe(8);
    expect(vertexLayout.attrib).toStrictEqual({
      _layout: vertexLayout,
      format: 'float16x4',
      offset: 0,
    });
  });
});

describe('connectAttributesToShader', () => {
  it('connects a single f32 attribute', () => {
    const shaderInputLayout = d.f32;
    const layout = tgpu.vertexLayout(d.arrayOf(d.f32));
    const attrib = layout.attrib;

    expect(connectAttributesToShader(shaderInputLayout, attrib)).toStrictEqual({
      bufferDefinitions: [
        {
          arrayStride: 4,
          stepMode: 'vertex',
          attributes: [
            {
              format: 'float32',
              offset: 0,
              shaderLocation: 0,
            },
          ],
        },
      ],
      usedVertexLayouts: [layout],
    });
  });

  it('connects a single vec4f attribute (with custom shader location)', () => {
    const shaderInputLayout = d.location(3, d.vec4f);
    const layout = tgpu.vertexLayout((n: number) => d.disarrayOf(d.unorm16x4, n));
    const attrib = layout.attrib;

    expect(connectAttributesToShader(shaderInputLayout, attrib)).toStrictEqual({
      bufferDefinitions: [
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [
            {
              format: 'unorm16x4',
              offset: 0,
              shaderLocation: 3,
            },
          ],
        },
      ],
      usedVertexLayouts: [layout],
    });
  });

  it('connects a record of attributes from a single layout', () => {
    const shaderInputLayout = {
      a: d.f32,
      b: d.location(3, d.vec2f),
      c: d.u32 /* should get @location(4) automatically */,
    };

    const layout = tgpu.vertexLayout((n: number) =>
      d.disarrayOf(
        d.unstruct({
          alpha: d.f32, // 4 bytes
          beta: d.unorm8x2, // 2 bytes
          gamma: d.u32, // 4 bytes
        }),
        n,
      ),
    );

    const result = connectAttributesToShader(shaderInputLayout, {
      // purposefully out of order, which should be controlled by the shader input.
      b: layout.attrib.beta,
      c: layout.attrib.gamma,
      a: layout.attrib.alpha,
    });

    expect(result).toStrictEqual({
      bufferDefinitions: [
        {
          arrayStride: 10,
          stepMode: 'vertex',
          attributes: [
            {
              format: 'float32',
              offset: 0,
              shaderLocation: 0,
            },
            {
              format: 'unorm8x2',
              offset: 4,
              shaderLocation: 3,
            },
            {
              format: 'uint32',
              offset: 6,
              shaderLocation: 4,
            },
          ],
        },
      ],
      usedVertexLayouts: [layout],
    });
  });

  it('connects a record of attributes from multiple layouts', () => {
    const shaderInputLayout = {
      vi: d.builtin.vertexIndex, // should be omitted
      a: d.f32,
      b: d.location(3, d.vec2f),
      c: d.u32 /* should get @location(4) automatically */,
    };

    const alphaBetaLayout = tgpu.vertexLayout((n: number) =>
      d.disarrayOf(
        d.unstruct({
          alpha: d.f32, // 4 bytes
          beta: d.unorm8x2, // 2 bytes
        }),
        n,
      ),
    );

    const gammaLayout = tgpu.vertexLayout(d.arrayOf(d.u32));

    const result = connectAttributesToShader(shaderInputLayout, {
      // purposefully out of order, which should be controlled by the shader input.
      b: alphaBetaLayout.attrib.beta,
      c: gammaLayout.attrib,
      a: alphaBetaLayout.attrib.alpha,
    });

    expect(result).toStrictEqual({
      bufferDefinitions: [
        {
          arrayStride: 6,
          stepMode: 'vertex',
          attributes: [
            {
              format: 'float32',
              offset: 0,
              shaderLocation: 0,
            },
            {
              format: 'unorm8x2',
              offset: 4,
              shaderLocation: 3,
            },
          ],
        },
        {
          arrayStride: 4,
          stepMode: 'vertex',
          attributes: [
            {
              format: 'uint32',
              offset: 0,
              shaderLocation: 4,
            },
          ],
        },
      ],
      usedVertexLayouts: [alphaBetaLayout, gammaLayout],
    });
  });

  it('connects a single vec4h attribute', () => {
    const shaderInputLayout = d.vec4h;
    const layout = tgpu.vertexLayout((n: number) => d.disarrayOf(d.float16x4, n));
    const attrib = layout.attrib;

    expect(connectAttributesToShader(shaderInputLayout, attrib)).toStrictEqual({
      bufferDefinitions: [
        {
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [
            {
              format: 'float16x4',
              offset: 0,
              shaderLocation: 0,
            },
          ],
        },
      ],
      usedVertexLayouts: [layout],
    });
  });

  it('connects a record of attributes from a single layout (with f16 variants)', () => {
    const shaderInputLayout = {
      a: d.f16,
      b: d.location(3, d.vec2h),
      c: d.u32 /* should get @location(4) automatically */,
      d: d.f32,
    };

    const layout = tgpu.vertexLayout((n: number) =>
      d.disarrayOf(
        d.unstruct({
          alpha: d.f16, // 2 bytes
          beta: d.float16x2, // 4 bytes
          gamma: d.u32, // 4 bytes
          delta: d.float16, // 2 bytes
        }),
        n,
      ),
    );

    const result = connectAttributesToShader(shaderInputLayout, {
      // purposefully out of order, which should be controlled by the shader input.
      b: layout.attrib.beta,
      c: layout.attrib.gamma,
      d: layout.attrib.delta,
      a: layout.attrib.alpha,
    });

    expect(result).toStrictEqual({
      bufferDefinitions: [
        {
          arrayStride: 12,
          stepMode: 'vertex',
          attributes: [
            {
              format: 'float16',
              offset: 0,
              shaderLocation: 0,
            },
            {
              format: 'float16x2',
              offset: 2,
              shaderLocation: 3,
            },
            {
              format: 'uint32',
              offset: 6,
              shaderLocation: 4,
            },
            {
              format: 'float16',
              offset: 10,
              shaderLocation: 5,
            },
          ],
        },
      ],
      usedVertexLayouts: [layout],
    });
  });

  it('throws when trying to use type that has no attribute representation', () => {
    expect(() => tgpu.vertexLayout(d.disarrayOf(d.vec3h))).toThrow();
  });
});
