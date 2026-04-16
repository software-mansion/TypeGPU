import { describe, expect, it } from 'vitest';
import tgpu, { d } from 'typegpu';

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
