import { tgpu, d, std } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createPrefixScan, prefixScan, reduce } from '../src/index.ts';
import { makeScanSchemas } from '../src/scan/schemas.ts';

const add = { operation: std.add, identityElement: 0 };

describe('prefix scan', () => {
  it('emits no warnings for any element type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const dataType of [d.u32, d.i32, d.f32] as const) {
      const buffer = root.createBuffer(d.arrayOf(dataType, 4096)).$usage('storage');
      prefixScan(root, buffer, add);
      reduce(root, buffer, { operation: std.max, identityElement: -1e30 });
    }

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('types the workgroup memory and layouts after the element type', () => {
    const { workgroupMemory, tile, scanLayout, applySumsLayout } = makeScanSchemas(d.i32);
    expect(tgpu.resolve([workgroupMemory, tile, scanLayout, applySumsLayout]))
      .toMatchInlineSnapshot(`
      "var<workgroup> workgroupMemory: array<i32, 256>;

      var<workgroup> tile: array<i32, 2112>;

      @group(0) @binding(0) var<storage, read_write> input: array<i32>;

      @group(0) @binding(1) var<storage, read_write> sums: array<i32>;

      @group(1) @binding(0) var<storage, read_write> input_1: array<i32>;

      @group(1) @binding(1) var<storage, read> sums_1: array<i32>;"
    `);
  });

  it('shares pipelines between plans with the same operation', ({ root, device }) => {
    const a = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const b = root.createBuffer(d.arrayOf(d.u32, 8192)).$usage('storage');

    createPrefixScan(root, a, add).run();
    const modulesAfterFirst = device.mock.createShaderModule.mock.calls.length;
    const pipelinesAfterFirst = device.mock.createComputePipeline.mock.calls.length;

    createPrefixScan(root, b, add).run();

    expect(device.mock.createShaderModule.mock.calls.length).toBe(modulesAfterFirst);
    expect(device.mock.createComputePipeline.mock.calls.length).toBe(pipelinesAfterFirst);
  });

  it('allocates no new GPU resources on repeated runs of a plan', ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const plan = createPrefixScan(root, buffer, add);

    plan.run();
    const buffersAfterFirst = device.mock.createBuffer.mock.calls.length;
    const bindGroupsAfterFirst = device.mock.createBindGroup.mock.calls.length;

    plan.run();
    plan.run();

    expect(device.mock.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
    expect(device.mock.createBindGroup.mock.calls.length).toBe(bindGroupsAfterFirst);
  });

  it('eagerly initializes only the pipelines the plan dispatches', async ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    const reducePlan = createPrefixScan(root, buffer, { ...add, reduceOnly: true });
    await reducePlan.initAsync();
    expect(device.mock.createComputePipelineAsync.mock.calls.length).toMatchInlineSnapshot(`1`);

    const scanPlan = createPrefixScan(root, buffer, add);
    await scanPlan.initAsync();
    expect(device.mock.createComputePipelineAsync.mock.calls.length).toMatchInlineSnapshot(`3`);

    reducePlan.run();
    scanPlan.run();
    expect(device.mock.createComputePipeline).not.toHaveBeenCalled();
  });

  it('one-shot helpers keep only the result alive', ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    expect(prefixScan(root, buffer, add)).toBe(buffer);
    const destroyedByScan = device.mock.createBuffer.mock.results.filter(
      (r) => r.value.destroy.mock.calls.length > 0,
    ).length;
    expect(destroyedByScan).toMatchInlineSnapshot(`2`);

    const total = reduce(root, buffer, add);
    expect(total.dataType.elementCount).toBe(1);
    expect(
      device.mock.createBuffer.mock.results.filter((r) => r.value.destroy.mock.calls.length > 0)
        .length,
    ).toMatchInlineSnapshot(`3`);
  });

  it('rejects empty buffers', ({ root }) => {
    const empty = root.createBuffer(d.arrayOf(d.f32, 0)).$usage('storage');
    expect(() => createPrefixScan(root, empty, add)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot scan an empty buffer.]`,
    );
  });
});
