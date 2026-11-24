import { describe, expect } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { meshes } from '@typegpu/geometry';
import { scalars } from './fixtures.ts';

describe('octahedral normals', () => {
  it('round-trips unit vectors within the snorm16 precision', () => {
    const directions = [
      d.vec3f(1, 0, 0),
      d.vec3f(0, -1, 0),
      d.vec3f(0, 0, 1),
      d.vec3f(0, 0, -1),
      d.vec3f(1, 2, 3),
      d.vec3f(-3, 1, -2),
      d.vec3f(0.2, -0.7, -0.1),
    ].map((v) => std.normalize(v));

    for (const n of directions) {
      const packed = std.pack2x16snorm(meshes.octahedralEncode(n));
      const decoded = meshes.octahedralDecode(std.unpack2x16snorm(packed));
      expect(std.dot(n, decoded)).toBeGreaterThan(Math.cos(1e-3));
    }
  });

  it('decodes a zero normal to +Z', () => {
    expect([...meshes.octahedralDecode(meshes.octahedralEncode(d.vec3f()))]).toEqual([0, 0, 1]);
  });
});

describe('representations', () => {
  it('stores a surface in 20 bytes instead of 48', () => {
    expect(d.sizeOf(meshes.Surface)).toBe(48);
    expect(d.sizeOf(meshes.OctahedralSurface)).toBe(20);
    expect(meshes.octahedralSurfaceAttribs.stride).toBe(20);
  });

  it('keeps a sphere close to the original after a round-trip on the CPU', () => {
    const sphere = meshes.sphere({ radialSegments: 8, heightSegments: 4 });
    const roundTrip = meshes.decode(
      meshes.encode(sphere, meshes.octahedralSurface),
      meshes.octahedralSurface,
    );

    expect(roundTrip.indexCount).toBe(sphere.indexCount);
    for (let i = 0; i < sphere.vertexCount; i++) {
      const a = sphere.vertexAt(i);
      const b = roundTrip.vertexAt(i);
      expect([...b.position]).toEqual([...a.position]);
      expect(std.dot(a.normal, b.normal)).toBeGreaterThan(Math.cos(1e-3));
      expect(std.distance(a.uv, b.uv)).toBeLessThan(1e-4);
    }
  });

  it('rejects geometries of other schemas', () => {
    expect(() => meshes.encode(scalars as never, meshes.octahedralSurface)).toThrow();
    expect(() => meshes.decode(meshes.plane() as never, meshes.octahedralSurface)).toThrow();
  });

  it('bakes the packed vertices and decodes them when read', ({ root }) => {
    const mesh = meshes.bake(root, meshes.encode(meshes.plane(), meshes.octahedralSurface));
    const surface = meshes.decode(mesh, meshes.octahedralSurface);
    const read = tgpu.fn([d.u32], meshes.Surface)(surface.vertexAt);

    expect(mesh.vertices.dataType.elementType).toBe(meshes.OctahedralSurface);
    expect(tgpu.resolve([read])).toMatchInlineSnapshot(`
      "struct OctahedralSurface {
        px: f32,
        py: f32,
        pz: f32,
        normal: u32,
        uv: u32,
      }

      @group(0) @binding(0) var<storage, read> output: array<OctahedralSurface, 4>;

      fn vertexAt_1(i: u32) -> OctahedralSurface {
        return output[i];
      }

      fn octahedralDecode(e: vec2f) -> vec3f {
        var n = vec3f(e.x, e.y, ((1f - abs(e.x)) - abs(e.y)));
        let t = saturate(-(n.z));
        n.x += select(t, -(t), (n.x >= 0f));
        n.y += select(t, -(t), (n.y >= 0f));
        return normalize(n);
      }

      struct Surface {
        position: vec3f,
        normal: vec3f,
        uv: vec2f,
      }

      fn decode(p: OctahedralSurface) -> Surface {
        return Surface(vec3f(p.px, p.py, p.pz), octahedralDecode(unpack2x16snorm(p.normal)), unpack2x16unorm(p.uv));
      }

      fn vertexAt(i: u32) -> Surface {
        return decode(vertexAt_1(i));
      }"
    `);
  });

  it('binds the baked buffer as unpacking vertex attributes', ({ root, renderPassEncoder }) => {
    const mesh = meshes.bake(root, meshes.encode(meshes.plane(), meshes.octahedralSurface));
    const pipeline = root
      .createRenderPipeline({
        attribs: meshes.octahedralSurfaceAttribs.attrib,
        vertex: ({ position, normal }) => {
          'use gpu';
          return { $position: d.vec4f(position + meshes.octahedralDecode(normal), 1) };
        },
      })
      .with(meshes.octahedralSurfaceAttribs, root.unwrap(mesh.vertices))
      .withIndexBuffer(mesh.indices);

    pipeline.with(renderPassEncoder).drawIndexed(mesh.indexCount);

    expect(renderPassEncoder.mock.setVertexBuffer).toHaveBeenCalledWith(
      0,
      root.unwrap(mesh.vertices),
      undefined,
      undefined,
    );
  });
});
