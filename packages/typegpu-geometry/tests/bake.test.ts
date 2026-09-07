import { expect } from 'vitest';
import { d, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { meshes } from '@typegpu/geometry';
import { fromBuffer } from '../src/mesh/combinators.ts';
import { scalars, shaderCodes } from './fixtures.ts';

it('maps and unindexes in a shader', () => {
  const doubled = meshes.map(scalars, d.f32, (value) => {
    'use gpu';
    return value * 2;
  });
  const flat = meshes.unindexed(doubled);
  const read = tgpu.fn([d.u32], d.f32)(flat.vertexAt);

  expect(tgpu.resolve([read])).toMatchInlineSnapshot(`
    "fn indexAt(i: u32) -> u32 {
      return (i % 4u);
    }

    fn vertexAt_2(i: u32) -> f32 {
      return f32(i);
    }

    fn item(value: f32) -> f32 {
      return (value * 2f);
    }

    fn vertexAt_1(i: u32) -> f32 {
      return item(vertexAt_2(i));
    }

    fn vertexAt(i: u32) -> f32 {
      return vertexAt_1(indexAt(i));
    }"
  `);
});

it('prepares vertex and index fills before submitting', ({ root, device }) => {
  meshes.bake(root, scalars);

  expect(shaderCodes(device).join('\n\n')).toMatchInlineSnapshot(`
    "@group(0) @binding(0) var<storage, read_write> output: array<f32, 4>;

    fn vertexAt(i: u32) -> f32 {
      return f32(i);
    }

    fn item(i: u32) {
      output[i] = vertexAt(i);
    }

    @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
      let i = (gid.x + (gid.y * 64u));
      if ((i < 4u)) {
        item(i);
      }
    }

    @group(0) @binding(0) var<storage, read_write> writeIndices: array<u32, 6>;

    fn indexAt(i: u32) -> u32 {
      return (i % 4u);
    }

    fn item(i: u32) {
      writeIndices[i] = indexAt(i);
    }

    @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
      let i = (gid.x + (gid.y * 64u));
      if ((i < 6u)) {
        item(i);
      }
    }"
  `);
});

it('injects the vertex and index buffers', ({ root, renderPassEncoder }) => {
  const mesh = meshes.bake(root, meshes.plane());
  const pipeline = root
    .createRenderPipeline({
      attribs: mesh.layout.attrib,
      vertex: ({ position }) => {
        'use gpu';
        return { $position: d.vec4f(position, 1) };
      },
    })
    .pipe(mesh.inject());

  pipeline.with(renderPassEncoder).drawIndexed(mesh.indexCount);

  expect(mesh.layout).toBe(meshes.bake(root, meshes.plane()).layout);
  expect(renderPassEncoder.mock.setVertexBuffer).toHaveBeenCalledWith(
    0,
    root.unwrap(mesh.vertices),
    undefined,
    undefined,
  );
  expect(renderPassEncoder.mock.setIndexBuffer).toHaveBeenCalledWith(
    root.unwrap(mesh.indices),
    'uint32',
    undefined,
    undefined,
  );
});

it('retains caller-owned buffers and uses geometry counts instead of capacity', ({ root }) => {
  const vertices = root.createBuffer(d.arrayOf(d.f32, 64)).$usage('vertex', 'storage');
  const indices = root.createBuffer(d.arrayOf(d.u32, 64)).$usage('index', 'storage');
  const mesh = meshes.bake(root, scalars, { vertices, indices });
  mesh.destroy();

  expect([mesh.vertexCount, mesh.indexCount]).toEqual([4, 6]);
  expect(mesh.vertices).toBe(vertices);
  expect(mesh.indices).toBe(indices);
  expect(vertices.destroyed).toBe(false);
  expect(indices.destroyed).toBe(false);
});

it('destroys buffers it allocated', ({ root }) => {
  const mesh = meshes.bake(root, scalars);
  mesh.destroy();

  expect(mesh.vertices.destroyed).toBe(true);
  expect(mesh.indices.destroyed).toBe(true);
});

it('rejects counts outside the buffer capacity', ({ root }) => {
  const vertices = root.createBuffer(d.arrayOf(d.f32, 4)).$usage('storage');
  const indices = root.createBuffer(d.arrayOf(d.u32, 6)).$usage('storage');

  for (const vertexCount of [-1, 1.5, 5, NaN]) {
    expect(() => fromBuffer(vertices, { vertexCount })).toThrowErrorMatchingInlineSnapshot(
      `[Error: The vertex count must be an integer between 0 and 4]`,
    );
  }
  for (const indexCount of [-1, 1.5, 7, NaN]) {
    expect(() => fromBuffer(vertices, { indices, indexCount })).toThrowErrorMatchingInlineSnapshot(
      `[Error: The index count must be an integer between 0 and 6]`,
    );
  }
  expect(fromBuffer(vertices, { indices, vertexCount: 0, indexCount: 0 }).indexCount).toBe(0);
});

it('exposes writable vertices and allows mapped reads in another shader', ({ root }) => {
  const mesh = meshes.bake(root, scalars);
  const copied = meshes.map(mesh, d.f32, (value) => {
    'use gpu';
    return value + 1;
  });
  const vertices = mesh.vertices.as('mutable');
  const edit = tgpu.computeFn({ workgroupSize: [1] })(() => {
    'use gpu';
    vertices.$[0] = 1;
  });
  const read = tgpu.fn([d.u32], d.f32)(copied.vertexAt);

  expect(tgpu.resolve([edit, read])).toMatchInlineSnapshot(`
    "@group(0) @binding(0) var<storage, read_write> output: array<f32, 4>;

    @compute @workgroup_size(1) fn edit() {
      output[0i] = 1f;
    }

    @group(0) @binding(1) var<storage, read> output_1: array<f32, 4>;

    fn vertexAt_1(i: u32) -> f32 {
      return output_1[i];
    }

    fn item(value: f32) -> f32 {
      return (value + 1f);
    }

    fn vertexAt(i: u32) -> f32 {
      return item(vertexAt_1(i));
    }"
  `);
});
