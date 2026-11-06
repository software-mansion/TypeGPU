import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';

describe('tgpu.vertexLayout', () => {
  it('creates attributes from loose array of vec3f', () => {
    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(d.vec3f, count));

    expect(vertexLayout.stride).toBe(12);
    expect(vertexLayout.attrib.format).toBe('float32x3');
    expect(vertexLayout.attrib.offset).toBe(0);
  });

  it('creates attributes from loose array of structs', () => {
    const VertexData = d.struct({
      a: d.u32, // +16 (12 bytes of padding)
      b: d.vec3f, // + 12
      c: d.f32, // + 4
    });

    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(VertexData, count));

    expect(vertexLayout.stride).toBe(32);
    expect(vertexLayout.attrib).toMatchObject({
      a: { format: 'uint32', offset: 0 },
      b: { format: 'float32x3', offset: 16 },
      c: { format: 'float32', offset: 28 },
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
    expect(vertexLayout.attrib).toMatchObject({
      a: { format: 'uint32', offset: 0 },
      b: { format: 'float32x3', offset: 4 },
      c: { format: 'float32', offset: 16 },
    });
  });

  it('creates attributes from loose array with f16 variants', () => {
    const vertexLayout = tgpu.vertexLayout((count: number) => d.disarrayOf(d.float16x4, count));

    expect(vertexLayout.stride).toBe(8);
    expect(vertexLayout.attrib).toMatchObject({
      format: 'float16x4',
      offset: 0,
    });
  });

  it('preserves struct-relative alignment inside an unstruct but does not align starting offset', () => {
    const Geometry = d.struct({
      position: d.vec2f,
      color: d.vec3f,
    });
    const Vertex = d.unstruct({
      tint: d.unorm8x4,
      geometry: Geometry,
    });
    const layout = tgpu.vertexLayout(d.disarrayOf(Vertex));

    expect(layout.stride).toBe(36);
    expect(layout.attrib).toMatchObject({
      tint: { format: 'unorm8x4', offset: 0 },
      geometry: {
        position: { format: 'float32x2', offset: 4 },
        color: { format: 'float32x3', offset: 20 },
      },
    });
  });

  it("aligns a nested struct to its first field's explicit alignment", () => {
    const Geometry = d.struct({
      position: d.align(16, d.vec2f),
      color: d.vec3f,
    });
    const Vertex = d.unstruct({
      tint: d.unorm8x4,
      geometry: Geometry,
    });
    const layout = tgpu.vertexLayout(d.disarrayOf(Vertex));

    expect(layout.stride).toBe(48);
    expect(layout.attrib).toMatchObject({
      tint: { format: 'unorm8x4', offset: 0 },
      geometry: {
        position: { format: 'float32x2', offset: 16 },
        color: { format: 'float32x3', offset: 32 },
      },
    });
  });

  it('throws when trying to use type that has no attribute representation', () => {
    expect(() => tgpu.vertexLayout(d.disarrayOf(d.vec3h))).toThrow();
  });
});
