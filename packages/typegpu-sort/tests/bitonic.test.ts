import { d } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createBitonicSorter } from '../src/index.ts';
import { getConversionWarnings, getResolvedWgsl } from './utils.ts';

describe('bitonic sort', () => {
  it('creates type-matched kernels without conversion warnings', ({ root, device }) => {
    const warnSpy = vi.spyOn(console, 'warn');

    for (const keyType of [d.u32, d.i32, d.f32] as const) {
      const data = root.createBuffer(d.arrayOf(keyType, 256)).$usage('storage');
      createBitonicSorter(root, data).run();
    }

    const wgsl = getResolvedWgsl(device);
    expect(wgsl).toContain('array<u32>');
    expect(wgsl).toContain('array<i32>');
    expect(wgsl).toContain('array<f32>');

    expect(getConversionWarnings(warnSpy)).toEqual([]);
    warnSpy.mockRestore();
  });

  it('performs no buffer writes or allocations during run (uniforms precreated)', ({
    root,
    device,
  }) => {
    const data = root.createBuffer(d.arrayOf(d.u32, 1024)).$usage('storage');
    const sorter = createBitonicSorter(root, data);

    sorter.run();
    const writesAfterFirst = (device.mock.queue.writeBuffer as { mock: { calls: unknown[] } }).mock
      .calls.length;
    const buffersAfterFirst = device.mock.createBuffer.mock.calls.length;

    sorter.run();

    expect(
      (device.mock.queue.writeBuffer as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBe(writesAfterFirst);
    expect(device.mock.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
  });

  it('includes payload machinery only when a values buffer is provided', ({ root, device }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 256)).$usage('storage');
    createBitonicSorter(root, keys).run();
    expect(getResolvedWgsl(device)).not.toContain('vals');

    const values = root.createBuffer(d.arrayOf(d.u32, 256)).$usage('storage');
    createBitonicSorter(root, keys, { values }).run();
    expect(getResolvedWgsl(device)).toContain('vals');
  });
});
