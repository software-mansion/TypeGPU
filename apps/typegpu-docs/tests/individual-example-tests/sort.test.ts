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

      @group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      @group(0) @binding(0) var<storage, read> src: array<u32>;

      fn copyAt(idx: u32) {
        dst[idx] = src[idx];
      }

      @group(0) @binding(2) var<uniform> padding: u32;

      @compute @workgroup_size(256) fn pad(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let idx = ((flatWorkgroupIndex(wid, numWorkgroups) * 256u) + lid.x);
        if ((idx < 841u)) {
          copyAt(idx);
        }
        else {
          if ((idx < 1024u)) {
            dst[idx] = padding;
          }
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

      fn offsetKey(v: u32) -> u32 {
        return (clamp(v, 0u, 255u) - 0u);
      }

      fn sortKey(v: u32) -> u32 {
        let sortable = offsetKey(v);
        return sortable;
      }

      fn compare(a: u32, b: u32) -> bool {
        return (sortKey(a) < sortKey(b));
      }

      fn swapLocalAt(a: u32, b: u32, left: u32, right: u32) {
        localKeys[a] = right;
        localKeys[b] = left;
      }

      fn exchangeLocal(base: u32, iLocal: u32, stride: u32, k: u32) {
        let jLocal = (iLocal + stride);
        let left = localKeys[iLocal];
        let right = localKeys[jLocal];
        let ascending = (((base + iLocal) & k) == 0u);
        if (select(compare(left, right), compare(right, left), ascending)) {
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

      struct stepUniformsType {
        k: u32,
        jShift: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms: stepUniformsType;

      @group(1) @binding(0) var<storage, read_write> data: array<u32>;

      fn offsetKey(v: u32) -> u32 {
        return (clamp(v, 0u, 255u) - 0u);
      }

      fn sortKey(v: u32) -> u32 {
        let sortable = offsetKey(v);
        return sortable;
      }

      fn compare(a: u32, b: u32) -> bool {
        return (sortKey(a) < sortKey(b));
      }

      fn swapAt(i: u32, j: u32, left: u32, right: u32) {
        data[i] = right;
        data[j] = left;
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
        if (select(compare(left, right), compare(right, left), ascending)) {
          swapAt(i, ixj, left, right);
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

      struct stepUniformsType {
        k: u32,
        jShift: u32,
      }

      @group(1) @binding(0) var<uniform> uniforms: stepUniformsType;

      fn offsetKey(v: u32) -> u32 {
        return (clamp(v, 0u, 255u) - 0u);
      }

      fn sortKey(v: u32) -> u32 {
        let sortable = offsetKey(v);
        return sortable;
      }

      fn compare(a: u32, b: u32) -> bool {
        return (sortKey(a) < sortKey(b));
      }

      fn swapLocalAt(a: u32, b: u32, left: u32, right: u32) {
        localKeys[a] = right;
        localKeys[b] = left;
      }

      fn exchangeLocal(base: u32, iLocal: u32, stride: u32, k: u32) {
        let jLocal = (iLocal + stride);
        let left = localKeys[iLocal];
        let right = localKeys[jLocal];
        let ascending = (((base + iLocal) & k) == 0u);
        if (select(compare(left, right), compare(right, left), ascending)) {
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
      }

      fn flatWorkgroupIndex(wid: vec3u, numWorkgroups: vec3u) -> u32 {
        return ((wid.x + (wid.y * numWorkgroups.x)) + ((wid.z * numWorkgroups.x) * numWorkgroups.y));
      }

      @group(0) @binding(1) var<storage, read_write> dst: array<u32>;

      @group(0) @binding(0) var<storage, read> src: array<u32>;

      fn copyAt(idx: u32) {
        dst[idx] = src[idx];
      }

      @compute @workgroup_size(256) fn unpad(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u, @builtin(num_workgroups) numWorkgroups: vec3u) {
        let idx = ((flatWorkgroupIndex(wid, numWorkgroups) * 256u) + lid.x);
        if ((idx < 841u)) {
          copyAt(idx);
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
