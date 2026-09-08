import { expect } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { meshes } from '@typegpu/geometry';

it('covers the whole triangle with each index prefix', () => {
  const indices = meshes.triangleIndices(16);
  for (const segments of [1, 2, 3, 7, 16]) {
    const prefix = indices.slice(0, meshes.triangleIndexCount(segments));
    expect(prefix).toEqual(meshes.triangleIndices(segments));
    expect(Math.max(...prefix) + 1).toBe(meshes.triangleVertexCount(segments));
    let area = 0;
    for (let i = 0; i < prefix.length; i += 3) {
      const [a, b, c] = prefix
        .slice(i, i + 3)
        .map((v) => meshes.triangleBarycentrics(v, segments).yz) as [d.v2f, d.v2f, d.v2f];
      const ab = b.sub(a);
      const ac = c.sub(a);
      const signedArea = (ab.x * ac.y - ab.y * ac.x) / 2;
      expect(signedArea).toBeGreaterThan(0);
      area += signedArea;
    }
    expect(area).toBeCloseTo(0.5);
  }
});

it.each([
  ['icosphere', meshes.patches.icosphere()],
  ['capsule', meshes.patches.capsule()],
  ['rounded box', meshes.patches.roundedBox({ width: 2, height: 1, depth: 3 })],
])('%s keeps adjacent patches watertight and supports both evaluation paths', (_, patches) => {
  const segments = 3;
  const perPatch = meshes.triangleVertexCount(segments);
  const mesh = meshes.tessellate(patches, segments);
  const edges = new Map<string, number>();
  const positions = Array.from({ length: mesh.vertexCount }, (_, i) => {
    const vertex = mesh.vertexAt(i);
    const patchVertex = patches.at(
      Math.floor(i / perPatch),
      meshes.triangleBarycentrics(i % perPatch, segments),
    );
    expect(vertex).toEqual(patchVertex);
    return [...vertex.position].map((v) => v.toFixed(5).replace('-0.00000', '0.00000')).join(',');
  });
  for (let i = 0; i < mesh.indexCount; i += 3) {
    const corners = [0, 1, 2].map((c) => positions[mesh.indexAt(i + c)]);
    for (let c = 0; c < 3; c++) {
      const key = [corners[c], corners[(c + 1) % 3]].toSorted().join('|');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  expect(new Set(edges.values())).toEqual(new Set([2]));

  const procedural = tgpu.fn([d.u32, d.vec3f], meshes.Surface)(patches.at);
  const baked = tgpu.fn([d.u32], meshes.Surface)(mesh.vertexAt);
  expect(() => tgpu.resolve([procedural, baked])).not.toThrow();
});

it('keeps the icosphere on the sphere without pole triangles', () => {
  const mesh = meshes.icosphere({ segments: 7, radius: 2 });
  const areas = [];
  for (let i = 0; i < mesh.indexCount; i += 3) {
    const a = mesh.vertexAt(mesh.indexAt(i));
    const b = mesh.vertexAt(mesh.indexAt(i + 1));
    const c = mesh.vertexAt(mesh.indexAt(i + 2));
    expect(std.length(a.position)).toBeCloseTo(2);
    expect(std.length(b.position)).toBeCloseTo(2);
    expect(std.length(c.position)).toBeCloseTo(2);
    areas.push(std.length(std.cross(b.position.sub(a.position), c.position.sub(a.position))));
  }
  expect(Math.min(...areas)).toBeGreaterThan(0);
  expect(Math.max(...areas) / Math.min(...areas)).toBeLessThan(1.15);
});

it('specializes spherical interpolation through a slot', () => {
  const interpolation = tgpu.slot(meshes.patches.uniformArea);
  const patches = meshes.patches.icosphere({
    interpolate: (a, b, c, w) => {
      'use gpu';
      return interpolation.$(a, b, c, w);
    },
  });
  const vertex = tgpu
    .fn(
      [d.u32, d.vec3f],
      meshes.Surface,
    )(patches.at)
    .with(interpolation, meshes.patches.linear);
  const code = tgpu.resolve([vertex]);
  expect(code.match(/fn (linear|uniformArea|warp)\(/g)).toMatchInlineSnapshot(`
    [
      "fn linear(",
    ]
  `);
});

it('rejects invalid tessellation and shape dimensions', () => {
  expect(() => meshes.icosphere({ segments: 0 })).toThrowErrorMatchingInlineSnapshot(
    `[Error: tessellation needs an integer segment count between 1 and 32767]`,
  );
  expect(() => meshes.icosphere({ radius: NaN })).toThrowErrorMatchingInlineSnapshot(
    `[Error: icosphere needs a positive finite radius]`,
  );
  expect(() => meshes.capsule({ height: -1 })).toThrowErrorMatchingInlineSnapshot(
    `[Error: capsule needs a positive finite radius and a nonnegative finite height]`,
  );
  expect(() => meshes.roundedBox({ width: 0 })).toThrowErrorMatchingInlineSnapshot(
    `[Error: roundedBox needs positive finite dimensions]`,
  );
  expect(() => meshes.roundedBox({ radius: 0.6 })).toThrowErrorMatchingInlineSnapshot(
    `[Error: roundedBox radius must fit within half its smallest dimension]`,
  );
});
