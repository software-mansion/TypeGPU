import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createBitonicSorter } from '../src/index.ts';
import { defaultCompare } from '../src/bitonic/bitonicSort.ts';
import { countDispatches } from './utils.ts';

describe('bitonic sort', () => {
  it('emits no warnings for any key type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const keyType of [d.u32, d.i32, d.f32] as const) {
      const keys = root.createBuffer(d.arrayOf(keyType, 256)).$usage('storage');
      const values = root.createBuffer(d.arrayOf(d.vec2f, 256)).$usage('storage');
      createBitonicSorter(root, keys).run();
      createBitonicSorter(root, keys, { values }).run();
    }

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('specializes the comparator per key type', () => {
    expect(
      tgpu.resolve([
        tgpu.fn([d.u32, d.u32], d.bool)(defaultCompare),
        tgpu.fn([d.i32, d.i32], d.bool)(defaultCompare),
        tgpu.fn([d.f32, d.f32], d.bool)(defaultCompare),
      ]),
    ).toMatchInlineSnapshot(`
      "fn defaultCompare(a: u32, b: u32) -> bool {
        return (a < b);
      }

      fn defaultCompare_1(a: i32, b: i32) -> bool {
        return (a < b);
      }

      fn defaultCompare_2(a: f32, b: f32) -> bool {
        return (a < b);
      }"
    `);
  });

  it('performs no buffer writes or allocations during run (uniforms precreated)', ({
    root,
    device,
  }) => {
    const data = root.createBuffer(d.arrayOf(d.u32, 1024)).$usage('storage');
    const sorter = createBitonicSorter(root, data);

    sorter.run();
    const writesAfterFirst = device.mock.queue.writeBuffer.mock.calls.length;
    const buffersAfterFirst = device.mock.createBuffer.mock.calls.length;

    sorter.run();

    expect(device.mock.queue.writeBuffer.mock.calls.length).toBe(writesAfterFirst);
    expect(device.mock.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
  });

  it('eagerly initializes every pipeline', ({ root, device }) => {
    const data = root.createBuffer(d.arrayOf(d.u32, 1024)).$usage('storage');
    const sorter = createBitonicSorter(root, data);

    sorter.initSync();
    const pipelines = device.mock.createComputePipeline.mock.calls.length;
    expect(pipelines).toMatchInlineSnapshot(`3`);

    sorter.run();
    expect(device.mock.createComputePipeline.mock.calls.length).toBe(pipelines);
  });

  it('pads keys and values for non-power-of-two sizes', ({ root, device }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage');
    const values = root.createBuffer(d.arrayOf(d.vec2f, 3)).$usage('storage');
    const sorter = createBitonicSorter(root, keys, { values });

    expect(sorter.paddedSize).toBe(4);
    sorter.initSync();
    expect(device.mock.createComputePipeline.mock.calls.length).toMatchInlineSnapshot(`3`);
    expect(countDispatches(root, sorter)).toMatchInlineSnapshot(`5`);
  });

  it('rejects empty buffers', ({ root }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 0)).$usage('storage');
    expect(() => createBitonicSorter(root, keys)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a bitonic sorter for an empty buffer.]`,
    );
  });
});
