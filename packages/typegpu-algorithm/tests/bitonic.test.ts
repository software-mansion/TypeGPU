import { tgpu, d } from 'typegpu';
import { expectRecordingOnly, it, type ModuleNamespace } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { bitonicSort } from '../src/index.ts';
import type {
  BitonicSortDefinition,
  BitonicSortInstance,
  BitonicSortIo,
  BitonicSortOptions,
} from '../src/index.ts';
import { defaultCompare } from '../src/bitonic/kernels.ts';
import { countDispatches, destroyedBuffers, shaderCodes } from './utils.ts';

bitonicSort satisfies ModuleNamespace<
  BitonicSortOptions,
  BitonicSortIo,
  BitonicSortDefinition,
  BitonicSortInstance
>;

describe('bitonic sort', () => {
  it('emits no warnings for any key type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const keyType of [d.u32, d.i32, d.f32] as const) {
      const keys = root.createBuffer(d.arrayOf(keyType, 256)).$usage('storage');
      const values = root.createBuffer(d.arrayOf(d.vec2f, 256)).$usage('storage');
      const pass = root.device.createCommandEncoder().beginComputePass();
      bitonicSort.defineAndInstantiate(root, { keyType }, { keys }).step(pass);
      bitonicSort
        .defineAndInstantiate(root, { keyType, valueType: d.vec2f }, { keys, values })
        .step(pass);
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

  it('only records in step', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 1000)).$usage('storage');
    const values = root.createBuffer(d.arrayOf(d.u32, 1000)).$usage('storage');
    const sorter = bitonicSort.defineAndInstantiate(
      root,
      { keyType: d.u32, valueType: d.u32 },
      { keys, values },
    );
    const pass = root.createCommandEncoder().beginComputePass();

    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      sorter.step(pass),
    );

    // TypeGPU creates the GPU objects on first use, later recordings allocate nothing
    const buffers = device.mock.createBuffer.mock.calls.length;
    const bindGroups = device.mock.createBindGroup.mock.calls.length;
    sorter.step(pass);
    expect(device.mock.createBuffer.mock.calls.length).toBe(buffers);
    expect(device.mock.createBindGroup.mock.calls.length).toBe(bindGroups);
  });

  it('eagerly initializes every pipeline it dispatches', ({ root, device }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 1024)).$usage('storage');
    const sorter = bitonicSort.defineAndInstantiate(root, { keyType: d.u32 }, { keys });

    sorter.initSync();
    const pipelines = device.mock.createComputePipeline.mock.calls.length;
    expect(pipelines).toMatchInlineSnapshot(`3`);

    countDispatches(root, sorter);
    expect(device.mock.createComputePipeline.mock.calls.length).toBe(pipelines);
  });

  it('pads keys and values for non-power-of-two sizes', ({ root, device }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage');
    const values = root.createBuffer(d.arrayOf(d.vec2f, 3)).$usage('storage');
    const sorter = bitonicSort.defineAndInstantiate(
      root,
      { keyType: d.u32, valueType: d.vec2f },
      { keys, values },
    );

    expect(sorter.paddedSize).toBe(4);
    sorter.initSync();
    expect(device.mock.createComputePipeline.mock.calls.length).toMatchInlineSnapshot(`3`);
    expect(countDispatches(root, sorter)).toMatchInlineSnapshot(`5`);
  });

  it('shares one definition between sizes', ({ root, device }) => {
    const definition = bitonicSort.define(root, { keyType: d.u32 });

    for (const size of [1000, 3000, 4096]) {
      const keys = root.createBuffer(d.arrayOf(d.u32, size)).$usage('storage');
      bitonicSort.instantiate(root, definition, { keys }).initSync();
    }

    // pad, unpad, and the global and local kernels of each variant
    expect(device.mock.createComputePipeline.mock.calls.length).toBe(8);
    for (const code of shaderCodes(device)) {
      expect(code).not.toMatch(/1000|1024|3000|4096/);
    }
  });

  it('falls back to global steps when the local kernels need too much workgroup memory', ({
    root,
  }) => {
    const definition = bitonicSort.define(root, { keyType: d.u32, valueType: d.vec4f });
    const keys = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const values = root.createBuffer(d.arrayOf(d.vec4f, 4096)).$usage('storage');

    const local = bitonicSort.instantiate(root, definition, { keys, values });
    (
      root.device.limits as { maxComputeWorkgroupStorageSize: number }
    ).maxComputeWorkgroupStorageSize = definition.dense.localStorageSize - 1;
    const global = bitonicSort.instantiate(root, definition, { keys, values });

    // log2(4096) = 12 stages, each with as many steps as its index
    expect(countDispatches(root, global)).toBe((12 * 13) / 2);
    expect(countDispatches(root, local)).toBeLessThan(countDispatches(root, global));
  });

  it('validates the buffers against the definition', ({ root }) => {
    const definition = bitonicSort.define(root, { keyType: d.u32 });
    const floats = root.createBuffer(d.arrayOf(d.f32, 4)).$usage('storage');
    const keys = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
    const values = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');

    expect(() => bitonicSort.instantiate(root, definition, { keys: floats as never })).toThrow(
      /bitonicSort: the keys buffer holds f32/,
    );
    expect(() => bitonicSort.instantiate(root, definition, { keys, values })).toThrow(
      /requires a `valueType`/,
    );
  });

  it('destroys only what it created, once', ({ root, device }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage');
    const sorter = bitonicSort.defineAndInstantiate(root, { keyType: d.u32 }, { keys });
    const pass = root.device.createCommandEncoder().beginComputePass();
    sorter.step(pass);

    sorter.destroy();
    // valid flags, padded keys, and one uniform buffer per stage (3)
    expect(destroyedBuffers(device)).toBe(5);
    sorter[Symbol.dispose]();
    expect(destroyedBuffers(device)).toBe(5);
    expect(keys.buffer.destroy).not.toHaveBeenCalled();

    expect(() => sorter.step(pass)).toThrow('bitonicSort: cannot call step() after destroy().');
    expect(() => sorter.initSync()).toThrow(/bitonicSort/);
  });
});
