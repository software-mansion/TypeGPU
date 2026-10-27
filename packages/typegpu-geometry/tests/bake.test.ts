import { expect } from 'vitest';
import { d, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { meshes } from '@typegpu/geometry';
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

    @group(0) @binding(0) var<storage, read_write> output: array<u32, 6>;

    fn indexAt(i: u32) -> u32 {
      return (i % 4u);
    }

    fn item(i: u32) {
      output[i] = indexAt(i);
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

it('records vertex and index fills into one pass of a given encoder', ({
  root,
  device,
  commandEncoder,
  computePassEncoder,
}) => {
  const mesh = meshes.bake(root, scalars, { encoder: commandEncoder });

  expect(commandEncoder.mock.beginComputePass).toHaveBeenCalledOnce();
  expect(computePassEncoder.mock.dispatchWorkgroups).toHaveBeenCalledTimes(2);
  expect(computePassEncoder.mock.end).toHaveBeenCalledOnce();

  mesh.updateVertices({ pass: computePassEncoder });

  expect(computePassEncoder.mock.dispatchWorkgroups).toHaveBeenCalledTimes(3);
  expect(computePassEncoder.mock.end).toHaveBeenCalledOnce();
  expect(device.mock.queue.submit).not.toHaveBeenCalled();

  // @ts-expect-error: work goes either into an encoder or into an open pass
  mesh.updateVertices({ encoder: commandEncoder, pass: computePassEncoder });
});

it('bakes several meshes into shared buffers at offsets', ({ root, device }) => {
  const vertices = root.createBuffer(d.arrayOf(d.f32, 8)).$usage('vertex', 'storage');
  const indices = root.createBuffer(d.arrayOf(d.u32, 12)).$usage('index', 'storage');
  const first = meshes.bake(root, scalars, { vertices, indices });
  const second = meshes.bake(root, scalars, { vertices, indices, baseVertex: 4, firstIndex: 6 });

  expect([first.baseVertex, first.firstIndex]).toEqual([0, 0]);
  expect([second.baseVertex, second.firstIndex]).toEqual([4, 6]);
  expect(() => meshes.bake(root, scalars, { vertices, indices, baseVertex: 5 })).toThrow(
    'The vertex range 5..9 exceeds the buffer capacity 8',
  );

  const fills = shaderCodes(device).slice(2).join('\n\n');
  expect(fills).toContain('vertices[(4u + i)] = vertexAt(i);');
  expect(fills).toContain('indices[(6u + i)] = indexAt(i);');

  const read = tgpu.fn(
    [d.u32],
    d.f32,
  )((i) => {
    'use gpu';
    return second.vertexAt(second.indexAt(i));
  });
  expect(tgpu.resolve([read])).toMatchInlineSnapshot(`
    "@group(0) @binding(0) var<storage, read> indices: array<u32, 12>;

    fn indexAt(i: u32) -> u32 {
      return indices[(6u + i)];
    }

    @group(0) @binding(1) var<storage, read> vertices: array<f32, 8>;

    fn vertexAt(i: u32) -> f32 {
      return vertices[(4u + i)];
    }

    fn read_1(i: u32) -> f32 {
      return vertexAt(indexAt(i));
    }"
  `);
});

it('bakes only the indices and keeps reading vertices from the source', ({ root, device }) => {
  const baked = meshes.bakeIndices(root, scalars);
  const read = tgpu.fn(
    [d.u32],
    d.f32,
  )((i) => {
    'use gpu';
    return baked.vertexAt(baked.indexAt(i));
  });

  expect(shaderCodes(device).join('\n\n')).toMatchInlineSnapshot(`
    "@group(0) @binding(0) var<storage, read_write> output: array<u32, 6>;

    fn indexAt(i: u32) -> u32 {
      return (i % 4u);
    }

    fn item(i: u32) {
      output[i] = indexAt(i);
    }

    @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
      let i = (gid.x + (gid.y * 64u));
      if ((i < 6u)) {
        item(i);
      }
    }"
  `);
  expect(tgpu.resolve([read])).toMatchInlineSnapshot(`
    "@group(0) @binding(0) var<storage, read> output: array<u32, 6>;

    fn indexAt(i: u32) -> u32 {
      return output[i];
    }

    fn vertexAt(i: u32) -> f32 {
      return f32(i);
    }

    fn read_1(i: u32) -> f32 {
      return vertexAt(indexAt(i));
    }"
  `);
});

it('injects only the index buffer', ({ root, renderPassEncoder }) => {
  const baked = meshes.bakeIndices(root, scalars);
  const pipeline = root
    .createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f() };
      },
    })
    .pipe(baked.inject());

  pipeline.with(renderPassEncoder).drawIndexed(baked.indexCount);

  expect(renderPassEncoder.mock.setVertexBuffer).not.toHaveBeenCalled();
  expect(renderPassEncoder.mock.setIndexBuffer).toHaveBeenCalledWith(
    root.unwrap(baked.indices),
    'uint32',
    undefined,
    undefined,
  );
});

it('bakes indices into a caller-owned buffer at an offset', ({ root, device }) => {
  const indices = root.createBuffer(d.arrayOf(d.u32, 12)).$usage('index', 'storage');
  const baked = meshes.bakeIndices(root, scalars, { indices, firstIndex: 6 });
  baked.destroy();

  expect([baked.firstIndex, baked.indexCount]).toEqual([6, 6]);
  expect(baked.indices).toBe(indices);
  expect(indices.destroyed).toBe(false);
  expect(shaderCodes(device).join('\n\n')).toContain('indices[(6u + i)] = indexAt(i);');
  expect(() => meshes.bakeIndices(root, scalars, { indices, firstIndex: 7 })).toThrow(
    'The index range 7..13 exceeds the buffer capacity 12',
  );
});

it('records the index fill into a given encoder', ({
  root,
  device,
  commandEncoder,
  computePassEncoder,
}) => {
  meshes.bakeIndices(root, scalars, { encoder: commandEncoder });

  expect(commandEncoder.mock.beginComputePass).toHaveBeenCalledOnce();
  expect(computePassEncoder.mock.dispatchWorkgroups).toHaveBeenCalledOnce();
  expect(computePassEncoder.mock.end).toHaveBeenCalledOnce();
  expect(device.mock.queue.submit).not.toHaveBeenCalled();
});
