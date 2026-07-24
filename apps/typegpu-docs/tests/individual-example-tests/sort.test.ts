/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('sort example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'algorithms',
        name: 'sort',
        controlTriggers: ['Sort'],
        expectedCalls: 6,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      struct copyParamsType {
        srcLength: u32,
        dstLength: u32,
        paddingValue: u32,
      }

      @group(0) @binding(2) var<uniform> params: copyParamsType;

      @group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      @group(0) @binding(0) var<storage, read> src: array<u32>;

      @compute @workgroup_size(256) fn copyPadKernel(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let idx = ((flatWorkgroupIndex(wid, numWorkgroups) * 256u) + lid.x);
        if ((idx >= params.dstLength)) {
          return;
        }
        dst[idx] = select(params.paddingValue, src[idx], (idx < params.srcLength));
      }

      fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      @group(0) @binding(0) var<storage, read_write> data: array<u32>;

      var<workgroup> localKeys: array<u32, 512>;

      fn loadShared(base: u32, tid: u32) {
        localKeys[tid] = data[(base + tid)];
        localKeys[(tid + 256u)] = data[((base + tid) + 256u)];
      }

      fn defaultCompare(a: u32, b: u32) -> bool {
        return (a < b);
      }

      fn swapLocalValues(_arg_0: u32, _arg_1: u32) {

      }

      fn exchangeLocal(base: u32, iLocal: u32, stride: u32, k: u32) {
        let ixjLocal = (iLocal + stride);
        let left = localKeys[iLocal];
        let right = localKeys[ixjLocal];
        let ascending = (((base + iLocal) & k) == 0u);
        let leftFirst = defaultCompare(left, right);
        let shouldSwap = select(leftFirst, !leftFirst, ascending);
        if (shouldSwap) {
          localKeys[iLocal] = right;
          localKeys[ixjLocal] = left;
          swapLocalValues(iLocal, ixjLocal);
        }
      }

      fn mergeDown(base: u32, tid: u32, startShift: u32, k: u32) {
        for (var jShift = startShift; (jShift > 0u); jShift--) {
          workgroupBarrier();
          let stride = (1u << (jShift - 1u));
          let below = (tid & (stride - 1u));
          let above = (tid >> (jShift - 1u));
          let iLocal = (below + (above * (stride << 1u)));
          exchangeLocal(base, iLocal, stride, k);
        }
      }

      fn storeShared(base: u32, tid: u32) {
        data[(base + tid)] = localKeys[tid];
        data[((base + tid) + 256u)] = localKeys[(tid + 256u)];
      }

      @compute @workgroup_size(256) fn localSortKernel(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let tid = lid.x;
        let base = (flatWorkgroupIndex(wid, numWorkgroups) * 512u);
        if ((base >= arrayLength(&data))) {
          return;
        }
        loadShared(base, tid);
        for (var kShift = 1u; (kShift <= 9u); kShift++) {
          mergeDown(base, tid, kShift, (1u << kShift));
        }
        workgroupBarrier();
        storeShared(base, tid);
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

      fn swapValues(_arg_0: u32, _arg_1: u32) {

      }

      @compute @workgroup_size(256) fn bitonicStepKernel(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let tid = ((flatWorkgroupIndex(wid, numWorkgroups) * 256u) + lid.x);
        let k = uniforms.k;
        let shift = uniforms.jShift;
        let dataLength = arrayLength(&data);
        let stride = (1u << shift);
        let maskBelow = (stride - 1u);
        let below = (tid & maskBelow);
        let above = (tid >> shift);
        let i = (below + (above * (stride << 1u)));
        let ixj = (i + stride);
        if ((ixj >= dataLength)) {
          return;
        }
        let ascending = ((i & k) == 0u);
        let left = data[i];
        let right = data[ixj];
        let leftFirst = defaultCompare(left, right);
        let shouldSwap = select(leftFirst, !leftFirst, ascending);
        if (shouldSwap) {
          data[i] = right;
          data[ixj] = left;
          swapValues(i, ixj);
        }
      }

      fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      @group(0) @binding(0) var<storage, read_write> data: array<u32>;

      var<workgroup> localKeys: array<u32, 512>;

      fn loadShared(base: u32, tid: u32) {
        localKeys[tid] = data[(base + tid)];
        localKeys[(tid + 256u)] = data[((base + tid) + 256u)];
      }

      struct sortUniformsType {
        k: u32,
        jShift: u32,
      }

      @group(0) @binding(1) var<uniform> uniforms: sortUniformsType;

      fn defaultCompare(a: u32, b: u32) -> bool {
        return (a < b);
      }

      fn swapLocalValues(_arg_0: u32, _arg_1: u32) {

      }

      fn exchangeLocal(base: u32, iLocal: u32, stride: u32, k: u32) {
        let ixjLocal = (iLocal + stride);
        let left = localKeys[iLocal];
        let right = localKeys[ixjLocal];
        let ascending = (((base + iLocal) & k) == 0u);
        let leftFirst = defaultCompare(left, right);
        let shouldSwap = select(leftFirst, !leftFirst, ascending);
        if (shouldSwap) {
          localKeys[iLocal] = right;
          localKeys[ixjLocal] = left;
          swapLocalValues(iLocal, ixjLocal);
        }
      }

      fn mergeDown(base: u32, tid: u32, startShift: u32, k: u32) {
        for (var jShift = startShift; (jShift > 0u); jShift--) {
          workgroupBarrier();
          let stride = (1u << (jShift - 1u));
          let below = (tid & (stride - 1u));
          let above = (tid >> (jShift - 1u));
          let iLocal = (below + (above * (stride << 1u)));
          exchangeLocal(base, iLocal, stride, k);
        }
      }

      fn storeShared(base: u32, tid: u32) {
        data[(base + tid)] = localKeys[tid];
        data[((base + tid) + 256u)] = localKeys[(tid + 256u)];
      }

      @compute @workgroup_size(256) fn localMergeKernel(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let tid = lid.x;
        let base = (flatWorkgroupIndex(wid, numWorkgroups) * 512u);
        if ((base >= arrayLength(&data))) {
          return;
        }
        loadShared(base, tid);
        mergeDown(base, tid, 9u, uniforms.k);
        workgroupBarrier();
        storeShared(base, tid);
      }

      fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      struct copyParamsType {
        srcLength: u32,
        dstLength: u32,
        paddingValue: u32,
      }

      @group(0) @binding(2) var<uniform> params: copyParamsType;

      @group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      @group(0) @binding(0) var<storage, read> src: array<u32>;

      @compute @workgroup_size(256) fn copyBack(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let idx = ((flatWorkgroupIndex(wid, numWorkgroups) * 256u) + lid.x);
        if ((idx < params.srcLength)) {
          dst[idx] = src[idx];
        }
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      @group(0) @binding(0) var<storage, read> data_1: array<u32>;

      struct fragmentFn_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentFn(_arg_0: fragmentFn_Input) -> @location(0) vec4f {
        let data = (&data_1);
        let arrayLength_1 = arrayLength(&(*data));
        let cols = u32(round(sqrt(f32(arrayLength_1))));
        let rows = u32(round((f32(arrayLength_1) / f32(cols))));
        let col = u32(floor((_arg_0.uv.x * f32(cols))));
        let row = u32(floor((_arg_0.uv.y * f32(rows))));
        let idx = ((row * cols) + col);
        if ((idx >= arrayLength_1)) {
          return vec4f(0.10000000149011612, 0.10000000149011612, 0.10000000149011612, 1);
        }
        let value = (*data)[idx];
        let normalized = (f32(value) / 255f);
        return vec4f(normalized, normalized, normalized, 1f);
      }"
    `);
  });
});
