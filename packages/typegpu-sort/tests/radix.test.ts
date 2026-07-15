import { d, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createRadixSorter } from '../src/index.ts';
import { makeSubgroupScatterKernel } from '../src/radix/scatter.ts';
import { makeRadixSchemas } from '../src/radix/schemas.ts';
import { getConversionWarnings, getResolvedWgsl } from './utils.ts';

describe('radix sort', () => {
  it('selects the fallback scatter when subgroups are unavailable', ({ root, device }) => {
    const data = root.createBuffer(d.arrayOf(d.u32, 512)).$usage('storage');
    const sorter = createRadixSorter(root, data);

    expect(sorter.usesSubgroups).toBe(false);

    sorter.run();

    expect(getResolvedWgsl(device)).not.toContain('subgroup');
  });

  it('emits no implicit conversion warnings for any key type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn');

    for (const keyType of [d.u32, d.i32, d.f32] as const) {
      const data = root.createBuffer(d.arrayOf(keyType, 512)).$usage('storage');
      createRadixSorter(root, data).run();
    }

    expect(getConversionWarnings(warnSpy)).toEqual([]);
    warnSpy.mockRestore();
  });

  it('extracts i32 digits without an INT_MIN literal', ({ root, device }) => {
    const data = root.createBuffer(d.arrayOf(d.i32, 512)).$usage('storage');
    createRadixSorter(root, data).run();

    const wgsl = getResolvedWgsl(device);
    expect(wgsl).toContain('array<i32>');
    expect(wgsl).not.toContain('-2147483648i');
  });

  it('allocates no new GPU resources on repeated runs', ({ root, device }) => {
    const data = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const sorter = createRadixSorter(root, data);

    sorter.run();
    const buffersAfterFirst = device.mock.createBuffer.mock.calls.length;
    const bindGroupsAfterFirst = device.mock.createBindGroup.mock.calls.length;
    const pipelinesAfterFirst = device.mock.createComputePipeline.mock.calls.length;

    sorter.run();
    sorter.run();

    expect(device.mock.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
    expect(device.mock.createBindGroup.mock.calls.length).toBe(bindGroupsAfterFirst);
    expect(device.mock.createComputePipeline.mock.calls.length).toBe(pipelinesAfterFirst);
  });

  it('includes payload machinery only when a values buffer is provided', ({ root, device }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 512)).$usage('storage');
    createRadixSorter(root, keys).run();
    expect(getResolvedWgsl(device)).not.toContain('dstVals');

    const values = root.createBuffer(d.arrayOf(d.vec4f, 512)).$usage('storage');
    createRadixSorter(root, keys, { values }).run();
    expect(getResolvedWgsl(device)).toContain('dstVals');
  });
});

describe('subgroup scatter kernel', () => {
  it('resolves with subgroup operations, sized by the maxSubgroups bound', () => {
    const schemas = makeRadixSchemas(d.u32, 'ascending');
    const kernel = makeSubgroupScatterKernel(schemas, 8);
    const wgsl = tgpu.resolve([kernel], { enableExtensions: ['subgroups'] });

    expect(wgsl).toContain('subgroupBallot');
    expect(wgsl).toContain('subgroup_invocation_id');
    expect(wgsl).toContain('subgroup_id');
    expect(wgsl).toContain('array<u32, 2048>');
  });

  it('moves the payload alongside keys when a value type is provided', () => {
    const schemas = makeRadixSchemas(d.u32, 'ascending', d.vec4f);
    const kernel = makeSubgroupScatterKernel(schemas, 8);
    const wgsl = tgpu.resolve([kernel], { enableExtensions: ['subgroups'] });

    expect(wgsl).toContain('array<vec4f>');
    expect(wgsl).toContain('dstVals');
  });
});
