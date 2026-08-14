import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createBitonicSorter } from '../src/index.ts';
import { defaultCompare } from '../src/bitonic/slots.ts';
import { getResolvedWgsl } from './utils.ts';

describe('bitonic sort', () => {
  it('emits no warnings for any key type', ({ root }) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const keyType of [d.u32, d.i32, d.f32] as const) {
      const data = root.createBuffer(d.arrayOf(keyType, 256)).$usage('storage');
      createBitonicSorter(root, data).run();
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

  it('should produce valid code for a composite payload', ({ root, device }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 1024)).$usage('storage');
    const values = root.createBuffer(d.arrayOf(d.vec2f, 1024)).$usage('storage');
    createBitonicSorter(root, keys, { values }).run();

    expect(getResolvedWgsl(device)).toMatchInlineSnapshot(`
      "fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      @group(0) @binding(0) var<storage, read_write> data: array<u32>;

      var<workgroup> localKeys: array<u32, 512>;

      var<workgroup> localVals: array<vec2f, 512>;

      @group(1) @binding(0) var<storage, read_write> vals: array<vec2f>;

      fn loadShared(base: u32, tid: u32) {
        localKeys[tid] = data[(base + tid)];
        localKeys[(tid + 256u)] = data[((base + tid) + 256u)];
        localVals[tid] = vals[(base + tid)];
        localVals[(tid + 256u)] = vals[((base + tid) + 256u)];
      }

      fn defaultCompare(a: u32, b: u32) -> bool {
        return (a < b);
      }

      fn swapLocalAt(a: u32, b: u32, left: u32, right: u32) {
        localKeys[a] = right;
        localKeys[b] = left;
        {
          let tmp = localVals[a];
          localVals[a] = localVals[b];
          localVals[b] = tmp;
        }
      }

      fn exchangeLocal(base: u32, iLocal: u32, stride: u32, k: u32) {
        let jLocal = (iLocal + stride);
        let left = localKeys[iLocal];
        let right = localKeys[jLocal];
        let ascending = (((base + iLocal) & k) == 0u);
        if (select(defaultCompare(left, right), defaultCompare(right, left), ascending)) {
          swapLocalAt(iLocal, jLocal, left, right);
        }
      }

      fn mergeDown(base: u32, tid: u32, startShift: u32, k: u32) {
        for (var jShift = startShift; (jShift > 0u); jShift--) {
          workgroupBarrier();
          let stride = (1u << (jShift - 1u));
          let below = (tid & (stride - 1u));
          let above = (tid >> (jShift - 1u));
          exchangeLocal(base, (below + (above * (stride << 1u))), stride, k);
        }
      }

      fn storeShared(base: u32, tid: u32) {
        data[(base + tid)] = localKeys[tid];
        data[((base + tid) + 256u)] = localKeys[(tid + 256u)];
        vals[(base + tid)] = localVals[tid];
        vals[((base + tid) + 256u)] = localVals[(tid + 256u)];
      }

      @compute @workgroup_size(256) fn localSort(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let base = (flatWorkgroupIndex(wid, numWorkgroups) * 512u);
        if ((base >= arrayLength(&data))) {
          return;
        }
        loadShared(base, lid.x);
        for (var kShift = 1u; (kShift <= 9u); kShift++) {
          mergeDown(base, lid.x, kShift, (1u << kShift));
        }
        workgroupBarrier();
        storeShared(base, lid.x);
      }

      fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      struct sortUniformsType {
        k: u32,
        jShift: u32,
      }

      @group(0) @binding(1) var<uniform> uniforms: sortUniformsType;

      @group(0) @binding(0) var<storage, read_write> data: array<u32>;

      fn defaultCompare(a: u32, b: u32) -> bool {
        return (a < b);
      }

      @group(1) @binding(0) var<storage, read_write> vals: array<vec2f>;

      fn swapAt(i: u32, j: u32, left: u32, right: u32) {
        data[i] = right;
        data[j] = left;
        {
          let tmp = vals[i];
          vals[i] = vals[j];
          vals[j] = tmp;
        }
      }

      @compute @workgroup_size(256) fn item(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let tid = ((flatWorkgroupIndex(wid, numWorkgroups) * 256u) + lid.x);
        let k = uniforms.k;
        let shift = uniforms.jShift;
        let stride = (1u << shift);
        let below = (tid & (stride - 1u));
        let above = (tid >> shift);
        let i = (below + (above * (stride << 1u)));
        let ixj = (i + stride);
        if ((ixj >= arrayLength(&data))) {
          return;
        }
        let left = data[i];
        let right = data[ixj];
        let ascending = ((i & k) == 0u);
        if (select(defaultCompare(left, right), defaultCompare(right, left), ascending)) {
          swapAt(i, ixj, left, right);
        }
      }

      fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      @group(0) @binding(0) var<storage, read_write> data: array<u32>;

      var<workgroup> localKeys: array<u32, 512>;

      var<workgroup> localVals: array<vec2f, 512>;

      @group(1) @binding(0) var<storage, read_write> vals: array<vec2f>;

      fn loadShared(base: u32, tid: u32) {
        localKeys[tid] = data[(base + tid)];
        localKeys[(tid + 256u)] = data[((base + tid) + 256u)];
        localVals[tid] = vals[(base + tid)];
        localVals[(tid + 256u)] = vals[((base + tid) + 256u)];
      }

      struct sortUniformsType {
        k: u32,
        jShift: u32,
      }

      @group(0) @binding(1) var<uniform> uniforms: sortUniformsType;

      fn defaultCompare(a: u32, b: u32) -> bool {
        return (a < b);
      }

      fn swapLocalAt(a: u32, b: u32, left: u32, right: u32) {
        localKeys[a] = right;
        localKeys[b] = left;
        {
          let tmp = localVals[a];
          localVals[a] = localVals[b];
          localVals[b] = tmp;
        }
      }

      fn exchangeLocal(base: u32, iLocal: u32, stride: u32, k: u32) {
        let jLocal = (iLocal + stride);
        let left = localKeys[iLocal];
        let right = localKeys[jLocal];
        let ascending = (((base + iLocal) & k) == 0u);
        if (select(defaultCompare(left, right), defaultCompare(right, left), ascending)) {
          swapLocalAt(iLocal, jLocal, left, right);
        }
      }

      fn mergeDown(base: u32, tid: u32, startShift: u32, k: u32) {
        for (var jShift = startShift; (jShift > 0u); jShift--) {
          workgroupBarrier();
          let stride = (1u << (jShift - 1u));
          let below = (tid & (stride - 1u));
          let above = (tid >> (jShift - 1u));
          exchangeLocal(base, (below + (above * (stride << 1u))), stride, k);
        }
      }

      fn storeShared(base: u32, tid: u32) {
        data[(base + tid)] = localKeys[tid];
        data[((base + tid) + 256u)] = localKeys[(tid + 256u)];
        vals[(base + tid)] = localVals[tid];
        vals[((base + tid) + 256u)] = localVals[(tid + 256u)];
      }

      @compute @workgroup_size(256) fn localMerge(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let base = (flatWorkgroupIndex(wid, numWorkgroups) * 512u);
        if ((base >= arrayLength(&data))) {
          return;
        }
        loadShared(base, lid.x);
        mergeDown(base, lid.x, 9u, uniforms.k);
        workgroupBarrier();
        storeShared(base, lid.x);
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

  it('rejects payload sorting when padding would be required', ({ root }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage');
    const values = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('storage');

    expect(() => createBitonicSorter(root, keys, { values })).toThrowErrorMatchingInlineSnapshot(
      `[Error: Bitonic sorting with a values buffer requires a power-of-two element count.]`,
    );
  });

  it('rejects empty buffers', ({ root }) => {
    const keys = root.createBuffer(d.arrayOf(d.u32, 0)).$usage('storage');
    expect(() => createBitonicSorter(root, keys)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a bitonic sorter for an empty buffer.]`,
    );
  });
});
