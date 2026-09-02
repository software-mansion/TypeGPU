import { tgpu, d, std } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createRadixSorter, sortKey } from '../src/index.ts';
import { makeDigitFn, makeRadixSchemas } from '../src/radix/schemas.ts';
import { countDispatches } from './utils.ts';

describe('radix sort', () => {
  it('emits no warnings for any key type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const keyType of [d.u32, d.i32, d.f32] as const) {
      const data = root.createBuffer(d.arrayOf(keyType, 512)).$usage('storage');
      createRadixSorter(root, data).run();
    }

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('extracts digits of every key type', () => {
    expect(
      tgpu.resolve([
        tgpu.fn([d.u32, d.u32], d.u32)(makeDigitFn(sortKey(d.u32))),
        tgpu.fn([d.i32, d.u32], d.u32)(makeDigitFn(sortKey(d.i32))),
        tgpu.fn([d.f32, d.u32], d.u32)(makeDigitFn(sortKey(d.f32))),
      ]),
    ).toMatchInlineSnapshot(`
      "fn sortKey(v: u32) -> u32 {
        let sortable = v;
        return sortable;
      }

      fn digit(v: u32, shift: u32) -> u32 {
        return ((sortKey(v) >> shift) & 255u);
      }

      fn sortableI32(v: i32) -> u32 {
        return (bitcast<u32>(v) ^ 2147483648u);
      }

      fn sortKey_1(v: i32) -> u32 {
        let sortable = sortableI32(v);
        return sortable;
      }

      fn digit_1(v: i32, shift: u32) -> u32 {
        return ((sortKey_1(v) >> shift) & 255u);
      }

      fn sortableF32(v: f32) -> u32 {
        let bits = select(bitcast<u32>(v), 0u, (v == 0f));
        return (bits ^ select(2147483648u, 4294967295u, (bits >= 2147483648u)));
      }

      fn sortKey_2(v: f32) -> u32 {
        let sortable = sortableF32(v);
        return sortable;
      }

      fn digit_2(v: f32, shift: u32) -> u32 {
        return ((sortKey_2(v) >> shift) & 255u);
      }"
    `);
  });

  it('composes a key map with a descending order', () => {
    const key = sortKey(d.u32, { direction: 'descending', key: std.reverseBits });
    expect(tgpu.resolve([tgpu.fn([d.u32], d.u32)(key)])).toMatchInlineSnapshot(`
      "fn sortKey(v: u32) -> u32 {
        let sortable = reverseBits(v);
        return ~sortable;
      }"
    `);
  });

  it('offsets integer ranges and quantizes float ranges', () => {
    expect(
      tgpu.resolve([
        tgpu.fn([d.i32], d.u32)(sortKey(d.i32, { range: [-100, 100] })),
        tgpu.fn([d.f32], d.u32)(sortKey(d.f32, { range: [0.5, 10], keyBits: 16 })),
        tgpu.fn([d.f32], d.u32)(sortKey(d.f32, { range: [0, 1] })),
      ]),
    ).toMatchInlineSnapshot(`
      "fn offsetKey(v: i32) -> u32 {
        return (u32(clamp(v, -100i, 100i)) - 4294967196u);
      }

      fn sortKey(v: i32) -> u32 {
        let sortable = offsetKey(v);
        return sortable;
      }

      fn quantized(v: f32) -> u32 {
        return u32(min(((clamp(v, 0.5f, 10f) - 0.5f) * 6898.421052631579f), 65535f));
      }

      fn sortKey_1(v: f32) -> u32 {
        let sortable = quantized(v);
        return sortable;
      }

      fn quantized_1(v: f32) -> u32 {
        return u32(min(((clamp(v, 0f, 1f) - 0f) * 4294967295f), 4294967040f));
      }

      fn sortKey_2(v: f32) -> u32 {
        let sortable = quantized_1(v);
        return sortable;
      }"
    `);
  });

  it('derives keyBits from an integer range', ({ root }) => {
    const keys = root.createBuffer(d.arrayOf(d.i32, 4096)).$usage('storage');

    expect(
      countDispatches(root, createRadixSorter(root, keys, { range: [-100, 100] })),
    ).toMatchInlineSnapshot(`4`);
    expect(
      countDispatches(root, createRadixSorter(root, keys, { range: [0, 65535] })),
    ).toMatchInlineSnapshot(`6`);
  });

  it('writes keys only when no values buffer is provided', () => {
    const { writeOutput } = makeRadixSchemas(d.u32, sortKey(d.u32));
    expect(tgpu.resolve([tgpu.fn([d.u32, d.u32, d.u32])(writeOutput)])).toMatchInlineSnapshot(`
      "@group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      fn writeOutput(key: u32, srcIdx: u32, dstIdx: u32) {
        dst[dstIdx] = key;
      }"
    `);
  });

  it('reorders the payload alongside the keys', () => {
    const { writeOutput } = makeRadixSchemas(d.u32, sortKey(d.u32), d.vec4f);
    expect(tgpu.resolve([tgpu.fn([d.u32, d.u32, d.u32])(writeOutput)])).toMatchInlineSnapshot(`
      "@group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      @group(1) @binding(1) var<storage, read_write> dstVals: array<vec4f>;

      @group(1) @binding(0) var<storage, read> srcVals: array<vec4f>;

      fn writeOutput(key: u32, srcIdx: u32, dstIdx: u32) {
        dst[dstIdx] = key;
        dstVals[dstIdx] = srcVals[srcIdx];
      }"
    `);
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

  it('eagerly initializes every pipeline', async ({ root, device }) => {
    const data = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const sorter = createRadixSorter(root, data);

    await sorter.initAsync();
    expect(device.mock.createComputePipelineAsync.mock.calls.length).toMatchInlineSnapshot(`3`);

    sorter.run();
    expect(device.mock.createComputePipeline).not.toHaveBeenCalled();
  });

  it('runs one pass per 8 key bits', ({ root }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    expect(countDispatches(root, createRadixSorter(root, keys))).toMatchInlineSnapshot(`12`);
    expect(
      countDispatches(root, createRadixSorter(root, keys, { keyBits: 16 })),
    ).toMatchInlineSnapshot(`6`);
  });

  it('copies back after an odd number of in-place passes but not out of place', ({ root }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');
    const out = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    expect(
      countDispatches(root, createRadixSorter(root, keys, { keyBits: 8 })),
    ).toMatchInlineSnapshot(`4`);
    expect(
      countDispatches(root, createRadixSorter(root, keys, { keyBits: 8, out: { keys: out } })),
    ).toMatchInlineSnapshot(`3`);
  });

  it('rejects invalid inputs', ({ root }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
    const values = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
    const empty = root.createBuffer(d.arrayOf(d.u32, 0)).$usage('storage');
    const short = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage');

    expect(() => createRadixSorter(root, empty)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a radix sorter for an empty buffer.]`,
    );
    expect(() => createRadixSorter(root, keys, { keyBits: 0 })).toThrowErrorMatchingInlineSnapshot(
      `[Error: keyBits must be an integer between 1 and 32, got 0.]`,
    );
    expect(() =>
      createRadixSorter(root, root.createBuffer(d.arrayOf(d.f32, 4)).$usage('storage'), {
        keyBits: 16,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: keyBits below 32 on f32 keys requires \`range\`.]`,
    );
    expect(() =>
      createRadixSorter(root, keys, { range: [0, 10], key: std.reverseBits }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: \`key\` replaces the built-in key map, so it cannot be combined with \`range\`.]`,
    );
    expect(() =>
      createRadixSorter(root, keys, { range: [5, 1] }),
    ).toThrowErrorMatchingInlineSnapshot(`[Error: range must be ordered, got [5, 1].]`);
    expect(() =>
      createRadixSorter(root, keys, { values, out: { keys: values } }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Sorting with values requires both \`values\` and \`out.values\`.]`,
    );
    expect(() =>
      createRadixSorter(root, keys, { values: short }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: The values buffer (3 elements) must match the key buffer (4 elements).]`,
    );
  });
});
