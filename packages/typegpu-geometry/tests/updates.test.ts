import { expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { d, tgpu } from 'typegpu';
import { meshes } from '@typegpu/geometry';
import { scalars, shaderCodes } from './fixtures.ts';

for (const asynchronous of [false, true]) {
  it(`reuses the initial fill pipeline (async: ${asynchronous})`, async ({ root, device }) => {
    const mesh = asynchronous ? await meshes.bakeAsync(root, scalars) : meshes.bake(root, scalars);
    expect(device.mock.createComputePipeline).toHaveBeenCalledTimes(asynchronous ? 0 : 2);
    expect(device.mock.createComputePipelineAsync).toHaveBeenCalledTimes(asynchronous ? 2 : 0);
    device.mock.createBuffer.mockClear();
    device.mock.createBindGroup.mockClear();
    device.mock.createComputePipeline.mockClear();
    device.mock.createComputePipelineAsync.mockClear();

    mesh.updateVertices();
    mesh.updateVertices();

    expect(device.mock.createBuffer).not.toHaveBeenCalled();
    expect(device.mock.createBindGroup).not.toHaveBeenCalled();
    expect(device.mock.createComputePipeline).not.toHaveBeenCalled();
    expect(device.mock.createComputePipelineAsync).not.toHaveBeenCalled();
  });
}

it('bakes indices from baked geometry without reading GPU values on the CPU', ({ root }) => {
  const source = meshes.bake(root, scalars);
  const mesh = meshes.bakeIndices(root, source);
  mesh.destroy();

  expect([mesh.vertexCount, mesh.indexCount]).toEqual([4, 6]);
  expect(mesh.indices.destroyed).toBe(true);
  expect(source.vertices.destroyed).toBe(false);
  expect(source.indices.destroyed).toBe(false);
});

it('specializes the vertex evaluator through a configured pipeline builder', ({ root }) => {
  const height = tgpu.accessor(d.f32);
  const source = {
    ...scalars,
    vertexAt: () => {
      'use gpu';
      return height.$;
    },
  };
  const mesh = meshes.bake(root, source, { with: root.with(height, 2) });
  expect(mesh.vertexCount).toBe(4);
});

it('does not submit or retain a caller-supplied encoder', ({ root, device }) => {
  const encoder = root['~unstable'].createCommandEncoder();
  const mesh = meshes.bake(root, scalars, { encoder });
  mesh.updateVertices({ encoder });
  expect(device.mock.queue.submit).not.toHaveBeenCalled();

  encoder.submit();
  mesh.updateVertices();

  expect(device.mock.queue.submit).toHaveBeenCalledTimes(2);
});

it('records into a supplied pass without ending it', ({ root, device, commandEncoder }) => {
  const mesh = meshes.bake(root, scalars);
  const pass = commandEncoder.beginComputePass();
  const nativePass = commandEncoder.mock.beginComputePass.mock.results[0]?.value;
  nativePass.end.mockClear();
  commandEncoder.mock.beginComputePass.mockClear();
  device.mock.queue.submit.mockClear();

  mesh.updateVertices({ pass });

  expect(commandEncoder.mock.beginComputePass).not.toHaveBeenCalled();
  expect(nativePass.end).not.toHaveBeenCalled();
  expect(device.mock.queue.submit).not.toHaveBeenCalled();
});

it('overrides source bindings for one update', ({ root, device, commandEncoder }) => {
  let nextBindGroup = 0;
  device.mock.createBindGroup.mockImplementation(() => `bindGroup${nextBindGroup++}`);
  const config = tgpu.bindGroupLayout({ height: { uniform: d.f32 } });
  const initial = root.createBindGroup(config, { height: root.createUniform(d.f32, 2) });
  const override = root.createBindGroup(config, { height: root.createUniform(d.f32, 3) });
  const mesh = meshes.bake(
    root,
    {
      schema: d.f32,
      topology: 'point-list',
      vertexCount: 1,
      vertexAt: () => {
        'use gpu';
        return config.$.height;
      },
    },
    { bindGroups: [initial] },
  );
  const pass = commandEncoder.mock.beginComputePass.mock.results[0]?.value;
  pass.setBindGroup.mockClear();

  mesh.updateVertices({ bindGroups: [override] });
  mesh.updateVertices();

  const inputs = pass.setBindGroup.mock.calls
    .map((call: unknown[]) => call[1])
    .filter((group: unknown) => group === root.unwrap(initial) || group === root.unwrap(override));
  expect(inputs).toEqual([root.unwrap(override), root.unwrap(initial)]);
  expect(device.mock.createComputePipeline).toHaveBeenCalledOnce();
});

it('spans multiple dispatch rows without evaluating vertices', ({
  root,
  device,
  commandEncoder,
}) => {
  const position = tgpu.accessor(d.f32);
  meshes.bakeIndices(root, {
    ...scalars,
    indexCount: 64 * 65535 + 1,
    vertexAt: () => {
      'use gpu';
      return position.$;
    },
  });
  const pass = commandEncoder.mock.beginComputePass.mock.results[0]?.value;

  expect(device.mock.createBuffer).toHaveBeenCalledOnce();
  expect(pass.dispatchWorkgroups).toHaveBeenCalledWith(65535, 2, undefined);
  expect(shaderCodes(device)[0]).toMatchInlineSnapshot(`
    "@group(0) @binding(0) var<storage, read_write> output: array<u32, 4194241>;

    fn indexAt(i: u32) -> u32 {
      return (i % 4u);
    }

    fn item(i: u32) {
      output[i] = indexAt(i);
    }

    @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
      let i = (gid.x + (gid.y * 4194240u));
      if ((i < 4194241u)) {
        item(i);
      }
    }"
  `);
});

it('prepares index-only baking asynchronously without evaluating vertices', async ({
  root,
  device,
}) => {
  const position = tgpu.accessor(d.f32);
  const mesh = await meshes.bakeIndicesAsync(root, {
    ...scalars,
    vertexAt: () => {
      'use gpu';
      return position.$;
    },
  });
  expect(mesh.indexCount).toBe(6);
  expect(device.mock.createComputePipelineAsync).toHaveBeenCalledOnce();
  expect(device.mock.createComputePipeline).not.toHaveBeenCalled();
});

for (const asynchronous of [false, true]) {
  it(`cleans up failed baking and retains caller buffers (async: ${asynchronous})`, async ({
    root,
    device,
  }) => {
    const vertices = root.createBuffer(d.arrayOf(d.f32, 4)).$usage('vertex', 'storage');
    const allocated = vi.spyOn(root, 'createBuffer');
    const compile = asynchronous
      ? device.mock.createComputePipelineAsync
      : device.mock.createComputePipeline;
    compile.mockImplementationOnce(() => {
      throw new Error('Compilation failed');
    });

    await expect(
      Promise.resolve().then(() =>
        asynchronous
          ? meshes.bakeAsync(root, scalars, { vertices })
          : meshes.bake(root, scalars, { vertices }),
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: Compilation failed]`);
    expect(allocated.mock.results.map(({ value }) => value.destroyed)).toEqual([true]);
    expect(vertices.destroyed).toBe(false);
    expect(device.mock.queue.submit).not.toHaveBeenCalled();
  });
}
