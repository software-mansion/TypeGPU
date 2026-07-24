import { d } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createRadixSorter } from '../src/index.ts';
import { getConversionWarnings, getResolvedWgsl } from './utils.ts';

describe('radix sort', () => {
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

  it('canonicalizes signed zero before extracting f32 digits', ({ root, device }) => {
    const data = root.createBuffer(d.arrayOf(d.f32, 512)).$usage('storage');
    createRadixSorter(root, data).run();

    const canonicalization = getResolvedWgsl(device)
      .split('\n')
      .find((line) => line.includes('bitcast<u32>(v)'));
    expect(canonicalization).toMatchInlineSnapshot(
      `"  let bits = select(bitcast<u32>(v), 0u, (v == 0f));"`,
    );
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
