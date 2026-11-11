import { tgpu, d, std } from 'typegpu';
import { expectRecordingOnly, it, type ModuleNamespace } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { prefixScan } from '../src/index.ts';
import type {
  PrefixScanDefinition,
  PrefixScanInstance,
  PrefixScanIo,
  PrefixScanOptions,
} from '../src/index.ts';
import { makeScanSchemas } from '../src/scan/schemas.ts';
import { countDispatches, destroyedBuffers } from './utils.ts';

prefixScan satisfies ModuleNamespace<
  PrefixScanOptions,
  PrefixScanIo,
  PrefixScanDefinition,
  PrefixScanInstance
>;

const add = { operation: std.add, identityElement: 0 };

describe('prefix scan', () => {
  it('emits no warnings for any element type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const dataType of [d.u32, d.i32, d.f32] as const) {
      const buffer = root.createBuffer(d.arrayOf(dataType, 4096)).$usage('storage');
      prefixScan.scan(root, buffer, add);
      prefixScan.reduce(root, buffer, { operation: std.max, identityElement: -1e30 });
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

  it('only records in step', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 5000)).$usage('storage');
    const scan = prefixScan.defineAndInstantiate(root, { ...add, elementType: d.u32 }, { buffer });
    const pass = root.createCommandEncoder().beginComputePass();

    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      scan.step(pass),
    );
  });

  it('shares one definition between sizes', ({ root, device }) => {
    const definition = prefixScan.define(root, { ...add, elementType: d.u32 });
    const a = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const b = root.createBuffer(d.arrayOf(d.u32, 8192)).$usage('storage');

    countDispatches(root, prefixScan.instantiate(root, definition, { buffer: a }));
    const modulesAfterFirst = device.mock.createShaderModule.mock.calls.length;
    const pipelinesAfterFirst = device.mock.createComputePipeline.mock.calls.length;

    countDispatches(root, prefixScan.instantiate(root, definition, { buffer: b }));

    expect(device.mock.createShaderModule.mock.calls.length).toBe(modulesAfterFirst);
    expect(device.mock.createComputePipeline.mock.calls.length).toBe(pipelinesAfterFirst);
  });

  it('one-shot helpers reuse definitions', ({ root, device }) => {
    const a = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const b = root.createBuffer(d.arrayOf(d.u32, 8192)).$usage('storage');

    prefixScan.scan(root, a, add);
    const pipelinesAfterFirst = device.mock.createComputePipeline.mock.calls.length;
    prefixScan.scan(root, b, add);

    expect(device.mock.createComputePipeline.mock.calls.length).toBe(pipelinesAfterFirst);
  });

  it('allocates no new GPU resources on repeated steps', ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const scan = prefixScan.defineAndInstantiate(root, { ...add, elementType: d.u32 }, { buffer });

    countDispatches(root, scan);
    const buffersAfterFirst = device.mock.createBuffer.mock.calls.length;
    const bindGroupsAfterFirst = device.mock.createBindGroup.mock.calls.length;

    countDispatches(root, scan);
    countDispatches(root, scan);

    expect(device.mock.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
    expect(device.mock.createBindGroup.mock.calls.length).toBe(bindGroupsAfterFirst);
  });

  it('eagerly initializes only the pipelines the instance dispatches', async ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    const reduction = prefixScan.defineAndInstantiate(
      root,
      { ...add, elementType: d.u32, reduceOnly: true },
      { buffer },
    );
    await reduction.initAsync();
    expect(device.mock.createComputePipelineAsync.mock.calls.length).toMatchInlineSnapshot(`1`);

    const scan = prefixScan.defineAndInstantiate(root, { ...add, elementType: d.u32 }, { buffer });
    await scan.initAsync();
    expect(device.mock.createComputePipelineAsync.mock.calls.length).toMatchInlineSnapshot(`3`);

    countDispatches(root, reduction);
    countDispatches(root, scan);
    expect(device.mock.createComputePipeline).not.toHaveBeenCalled();
  });

  it('one-shot helpers submit and keep only the result alive', ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    expect(prefixScan.scan(root, buffer, add)).toBe(buffer);
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
    expect(destroyedBuffers(device)).toMatchInlineSnapshot(`2`);

    const total = prefixScan.reduce(root, buffer, add);
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(2);
    expect(total.dataType.elementCount).toBe(1);
    expect(destroyedBuffers(device)).toMatchInlineSnapshot(`3`);
  });

  it('destroys only what it created, once', ({ root, device }) => {
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const scan = prefixScan.defineAndInstantiate(root, { ...add, elementType: d.u32 }, { buffer });
    const pass = root.device.createCommandEncoder().beginComputePass();
    scan.step(pass);

    scan.destroy();
    expect(destroyedBuffers(device)).toBe(2);
    scan[Symbol.dispose]();
    expect(destroyedBuffers(device)).toBe(2);
    expect(buffer.buffer.destroy).not.toHaveBeenCalled();

    expect(() => scan.step(pass)).toThrow('prefixScan: cannot call step() after destroy().');
  });
});
