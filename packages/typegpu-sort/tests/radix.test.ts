import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createRadixSorter } from '../src/index.ts';
import { makeDigitFn, makeRadixSchemas } from '../src/radix/schemas.ts';
import { getConversionWarnings } from './utils.ts';

describe('radix sort', () => {
  it('emits no implicit conversion warnings for any key type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn');

    for (const keyType of [d.u32, d.i32, d.f32] as const) {
      const data = root.createBuffer(d.arrayOf(keyType, 512)).$usage('storage');
      createRadixSorter(root, data).run();
    }

    expect(getConversionWarnings(warnSpy)).toMatchInlineSnapshot(`[]`);
    warnSpy.mockRestore();
  });

  it('extracts i32 digits without an INT_MIN literal', () => {
    const digit = tgpu.fn([d.i32, d.u32], d.u32)(makeDigitFn(d.i32, 'ascending'));
    expect(tgpu.resolve([digit])).toMatchInlineSnapshot(`
      "fn digitOfI32(v: i32, shift: u32) -> u32 {
        let raw = u32(((v >> shift) & 255i));
        return (raw ^ select(0u, 128u, (shift == 24u)));
      }"
    `);
  });

  it('canonicalizes signed zero before extracting f32 digits', () => {
    const digit = tgpu.fn([d.f32, d.u32], d.u32)(makeDigitFn(d.f32, 'ascending'));
    expect(tgpu.resolve([digit])).toMatchInlineSnapshot(`
      "fn digitOfF32(v: f32, shift: u32) -> u32 {
        let bits = select(bitcast<u32>(v), 0u, (v == 0f));
        let mask = select(2147483648u, 4294967295u, ((bits >> 31u) == 1u));
        return (((bits ^ mask) >> shift) & 255u);
      }"
    `);
  });

  it('inverts digits for a descending sort', () => {
    const digit = tgpu.fn([d.u32, d.u32], d.u32)(makeDigitFn(d.u32, 'descending'));
    expect(tgpu.resolve([digit])).toMatchInlineSnapshot(`
      "fn digitOfU32(v: u32, shift: u32) -> u32 {
        return ((v >> shift) & 255u);
      }

      fn descendingDigit(v: u32, shift: u32) -> u32 {
        return (255u - digitOfU32(v, shift));
      }"
    `);
  });

  it('writes keys only when no values buffer is provided', () => {
    const { writeOutput } = makeRadixSchemas(d.u32, 'ascending');
    expect(tgpu.resolve([tgpu.fn([d.u32, d.u32, d.u32])(writeOutput)])).toMatchInlineSnapshot(`
      "@group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      fn writeOutput(key: u32, srcIdx: u32, dstIdx: u32) {
        dst[dstIdx] = key;
      }"
    `);
  });

  it('reorders the payload alongside the keys', () => {
    const { writeOutput } = makeRadixSchemas(d.u32, 'ascending', d.vec4f);
    expect(tgpu.resolve([tgpu.fn([d.u32, d.u32, d.u32])(writeOutput)])).toMatchInlineSnapshot(`
      "@group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      @group(1) @binding(1) var<storage, read_write> dstVals: array<vec4f>;

      @group(1) @binding(0) var<storage, read> srcVals: array<vec4f>;

      fn writeOutput(key: u32, srcIdx: u32, dstIdx: u32) {
        dst[dstIdx] = key;
        {
          dstVals[dstIdx] = srcVals[srcIdx];
        }
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

  it('rejects empty buffers', ({ root }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 0)).$usage('storage');
    expect(() => createRadixSorter(root, keys)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a radix sorter for an empty buffer.]`,
    );
  });
});
