import { describe, expect } from 'vitest';
import { d, std } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { meshes } from '@typegpu/geometry';

function windingAgreesWithNormals(g: meshes.IndexedGeometry) {
  for (let t = 0; t < g.indexCount; t += 3) {
    const a = g.vertexAt(g.indexAt(t));
    const b = g.vertexAt(g.indexAt(t + 1));
    const c = g.vertexAt(g.indexAt(t + 2));
    const face = std.cross(b.position.sub(a.position), c.position.sub(a.position));
    if (std.length(face) < 1e-9) {
      continue;
    }
    const n = a.normal.add(b.normal).add(c.normal);
    if (std.dot(face, n) <= 0) {
      return false;
    }
  }
  return true;
}

describe('meshes on the CPU', () => {
  it('rejects subdivisions that would produce invalid coordinates or connectivity', () => {
    for (const count of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => meshes.plane({ widthSegments: count })).toThrowErrorMatchingInlineSnapshot(
        `[Error: parametric needs positive integer cols and rows]`,
      );
    }
  });

  it('rejects attached fields that collide with the source schema', () => {
    const ReplacedPosition = d.struct({ position: d.f32 });

    expect(() =>
      meshes.attach(meshes.plane(), ReplacedPosition, () => ReplacedPosition({ position: 1 })),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: attach cannot replace the existing field 'position'; use map instead]`,
    );
  });

  it.each([
    ['plane', meshes.plane()],
    ['sphere', meshes.sphere({ segments: 8, rings: 4 })],
    ['box', meshes.box()],
    ['cylinder', meshes.cylinder({ radialSegments: 6 })],
    ['torus', meshes.torus({ ringSegments: 6, tubeSegments: 4 })],
  ])('%s fits a unit cube with outward unit normals', (_, shape) => {
    expect(windingAgreesWithNormals(shape)).toBe(true);

    for (let i = 0; i < shape.vertexCount; i++) {
      const { position, normal } = shape.vertexAt(i);
      expect(
        Math.max(Math.abs(position.x), Math.abs(position.y), Math.abs(position.z)),
      ).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(std.length(normal)).toBeCloseTo(1);
    }
  });

  it('scales each box dimension independently', () => {
    const slab = meshes.box({ width: 2, height: 0.5, depth: 4 });
    let extent = d.vec3f();
    for (let i = 0; i < slab.vertexCount; i++) {
      extent = std.max(extent, std.abs(slab.vertexAt(i).position));
    }

    expect([...extent]).toEqual([1, 0.25, 2]);
  });

  it('keeps collapsed surface normals zero through transforms', () => {
    const collapsed = meshes.parametric(
      {
        at: () => {
          'use gpu';
          return d.vec3f();
        },
      },
      { cols: 1, rows: 1 },
    );
    const moved = meshes.transform(collapsed, std.translation4(d.vec3f(1, 2, 3)));

    expect(collapsed.vertexAt(0).normal).toEqual(d.vec3f());
    expect(moved.vertexAt(0).normal).toEqual(d.vec3f());
  });

  it('keeps concat indexed and offsets the indices of later parts', () => {
    const a = meshes.plane();
    const b = meshes.transform(meshes.plane(), std.translation4(d.vec3f(0, 1, 0)));
    const g = meshes.concat(a, b);

    expect(g.vertexCount).toBe(8);
    expect(g.indexCount).toBe(12);
    expect(g.indexAt(6)).toBe(4);
    expect(g.vertexAt(g.indexAt(6)).position.y).toBeCloseTo(1);

    const flat = meshes.unindexed(g);
    expect(flat.vertexCount).toBe(12);
    expect(flat.vertexAt(11).position.y).toBeCloseTo(1);

    const mixed = meshes.concat(a, { ...meshes.unindexed(b), vertexCount: 3 });
    expect([mixed.vertexCount, mixed.indexCount]).toEqual([7, 9]);
    expect([6, 7, 8].map(mixed.indexAt)).toEqual([4, 5, 6]);
  });

  it('returns zero vertices past the end of concatenated geometry', () => {
    const plane = meshes.plane();
    const scalar = meshes.map(plane, d.f32, (vertex) => {
      'use gpu';
      return vertex.position.x;
    });
    const scalars: meshes.IndexedGeometry<d.F32> = meshes.concat(scalar, scalar);
    const surfaces = meshes.concat(plane, plane);

    expect(scalars.vertexAt(scalars.vertexCount)).toBe(0);
    expect(surfaces.vertexAt(surfaces.vertexCount)).toEqual(meshes.Surface());
  });

  it('attaches fields and shares the schema between calls', () => {
    const Paint = d.struct({ color: d.vec3f, id: d.u32 });
    const paint = (g: meshes.IndexedGeometry, id: number) =>
      meshes.attach(g, Paint, (s) => {
        'use gpu';
        return Paint({ color: d.vec3f(s.uv, 0), id });
      });
    const a = paint(meshes.plane(), 1);
    const b = paint(meshes.sphere({ segments: 4, rings: 2 }), 2);
    const v = a.vertexAt(3);
    const scene = meshes.concat(a, b);

    expect(a.schema).toBe(b.schema);
    expect(Object.keys(a.schema.propTypes)).toEqual(['position', 'normal', 'uv', 'color', 'id']);
    expect(v.position.x).toBeCloseTo(0.5);
    expect(v.color.x).toBeCloseTo(1);
    expect(v.id).toBe(1);
    expect(scene.vertexAt(4).id).toBe(2);
  });

  it('preserves outward winding under reflections', () => {
    for (const source of [meshes.plane(), meshes.unindexed(meshes.plane())]) {
      const flat = meshes.unindexed(meshes.transform(source, std.scaling4(d.vec3f(-2, 3, 0.5))));
      const a = flat.vertexAt(0),
        b = flat.vertexAt(1),
        c = flat.vertexAt(2);
      const face = std.cross(b.position.sub(a.position), c.position.sub(a.position));

      expect(std.dot(face, a.normal)).toBeGreaterThan(0);
      expect(std.length(a.normal)).toBeCloseTo(1);
    }
  });

  it('transforms a custom schema and keeps its other fields', () => {
    const Tagged = d.struct({ position: d.vec3f, normal: d.vec3f, tag: d.f32 });
    const tagged = meshes.map(meshes.plane(), Tagged, (s) => {
      'use gpu';
      return Tagged({ position: s.position, normal: s.normal, tag: s.uv.x });
    });
    const moved = meshes.transform(tagged, std.translation4(d.vec3f(0, 2, 0)));

    expect(moved.schema).toBe(Tagged);
    const v = moved.vertexAt(1);
    expect(v.position.y).toBe(2);
    expect(v.tag).toBe(1);
  });

  it('samples normals inside the unit square', () => {
    const shape = meshes.parametric(
      {
        at: (u, v) => {
          'use gpu';
          return d.vec3f(std.sqrt(u), 0, 1 - v);
        },
      },
      { cols: 1, rows: 1 },
    );
    for (let i = 0; i < shape.vertexCount; i++) {
      expect(std.distance(shape.vertexAt(i).normal, d.vec3f(0, 1, 0))).toBeCloseTo(0);
    }
  });

  it('does not mutate cached source vertices when transforming', () => {
    const vertex = meshes.plane().vertexAt(0);
    const shape = { ...meshes.plane(), vertexAt: () => vertex };
    const moved = meshes.transform(shape, std.translation4(d.vec3f(0, 2, 0)));
    expect(moved.vertexAt(0).position.y).toBe(2);
    expect(moved.vertexAt(0).position.y).toBe(2);
    expect(vertex.position.y).toBe(0);

    expect(() =>
      meshes.transform(shape, std.scaling4(d.vec3f(1, 0, 1))),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: transform needs a finite invertible affine matrix]`,
    );
  });

  it.each([meshes.sphere(), meshes.cylinder()])(
    'omits collapsed pole and cap triangles',
    (shape) => {
      for (let i = 0; i < shape.indexCount; i += 3) {
        const a = shape.vertexAt(shape.indexAt(i)).position;
        const b = shape.vertexAt(shape.indexAt(i + 1)).position;
        const c = shape.vertexAt(shape.indexAt(i + 2)).position;
        expect(std.length(std.cross(b.sub(a), c.sub(a)))).toBeGreaterThan(1e-9);
      }
    },
  );
});
