import { tgpu, d, std } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createChunkedScan, createPrefixScan, prefixScan, reduce } from '../src/index.ts';
import { makeElementScanSchemas } from '../src/scan/elementKernels.ts';
import { makeScanSchemas } from '../src/scan/schemas.ts';
import { countDispatches } from './utils.ts';

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

  it('scans vectors and structs without warnings', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Pair = d.struct({ a: d.f32, b: d.f32 });

    const vectors = root.createBuffer(d.arrayOf(d.vec4f, 4096)).$usage('storage');
    prefixScan(root, vectors, { operation: std.add, identityElement: d.vec4f() });

    const pairs = root.createBuffer(d.arrayOf(Pair, 4096)).$usage('storage');
    const then = (f: d.Infer<typeof Pair>, g: d.Infer<typeof Pair>) => {
      'use gpu';
      return Pair({ a: g.a * f.a, b: g.a * f.b + g.b });
    };
    prefixScan(root, pairs, { operation: then, identityElement: { a: 1, b: 0 } });
    reduce(root, pairs, { operation: then, identityElement: { a: 1, b: 0 } });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('sizes a block after the element so the workgroup memory stays within 16 KiB', () => {
    const shape = (elementType: d.AnyWgslData) => {
      const { workgroupSize, elementsPerThread } = makeElementScanSchemas(elementType);
      return [workgroupSize, elementsPerThread];
    };

    expect(shape(d.vec4f)).toStrictEqual([256, 8]);
    expect(shape(d.mat4x4f)).toStrictEqual([256, 4]);
    expect(shape(d.struct({ p: d.arrayOf(d.vec4f, 8) }))).toStrictEqual([128, 4]);
    expect(() => shape(d.struct({ p: d.arrayOf(d.vec4f, 128) }))).toThrow();
  });

  it('records a chunked scan as reduce, a scan of the chunk totals and a walk', ({ root }) => {
    const values = root.createMutable(d.arrayOf(d.u32, 100_000));
    const options = {
      elementType: d.u32,
      operation: std.add,
      identityElement: 0,
      length: 100_000,
      chunkSize: 10,
      element: (_row: number, index: number) => {
        'use gpu';
        return index;
      },
      emit: (_row: number, index: number, prefix: number) => {
        'use gpu';
        values.$[index] = prefix;
      },
    };

    // 10 000 chunk totals take a two-level prefix scan: two scans and one apply.
    expect(countDispatches(root, createChunkedScan(root, options))).toBe(5);
    expect(countDispatches(root, createChunkedScan(root, { ...options, rows: 2 }))).toBe(3);
  });

  it('rejects chunked scan sizes that do not fit', ({ root }) => {
    const options = {
      elementType: d.u32,
      operation: std.add,
      identityElement: 0,
      length: 1000,
      element: (_row: number, index: number) => {
        'use gpu';
        return index;
      },
      emit: () => {
        'use gpu';
      },
    };

    expect(() => createChunkedScan(root, { ...options, rows: 5_000_000 })).toThrow();
    expect(() => createChunkedScan(root, { ...options, chunkSize: Number.NaN })).toThrow();
    expect(() => createChunkedScan(root, { ...options, length: 0 })).toThrow();
    expect(() => createChunkedScan(root, { ...options, length: 100.5 })).toThrow();
    expect(() => createChunkedScan(root, { ...options, rows: 1.5 })).toThrow();
    expect(() => createChunkedScan(root, { ...options, length: 2 ** 32 })).toThrow();
  });
});
