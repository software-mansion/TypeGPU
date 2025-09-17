/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('console log example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'tests',
      name: 'log-test',
      controlTriggers: [
        'One argument',
        'Multiple arguments',
        'String literals',
        'Different types',
        'Two logs',
        'Two threads',
        '100 dispatches',
        'Varying size logs',
        'Render pipeline',
        'Too many logs',
        // 'Too much data', // this one throws an error
      ],
      expectedCalls: 10,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn serializeU32_4(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 32>;

      fn log1_3(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 1;

        var serializedData0 = serializeU32_4(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(321);
      }

      struct mainCompute_Input_8 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_8)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn serializeU32_4(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn serializeVec3u_5(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_6: atomic<u32>;

      struct SerializedLogData_8 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_7: array<SerializedLogData_8, 32>;

      fn log1_3(_arg_0: u32, _arg_1: vec3u, _arg_2: u32, _arg_3: u32) {
        var index = atomicAdd(&indexBuffer_6, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_7[index].id = 1;

        var serializedData0 = serializeU32_4(_arg_0);
        dataBuffer_7[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeVec3u_5(_arg_1);
        dataBuffer_7[index].serializedData[1] = serializedData1[0];
        dataBuffer_7[index].serializedData[2] = serializedData1[1];
        dataBuffer_7[index].serializedData[3] = serializedData1[2];
        var serializedData2 = serializeU32_4(_arg_2);
        dataBuffer_7[index].serializedData[4] = serializedData2[0];
        var serializedData3 = serializeU32_4(_arg_3);
        dataBuffer_7[index].serializedData[5] = serializedData3[0];
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(1, vec3u(2, 3, 4), 5, 6);
      }

      struct mainCompute_Input_9 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_9)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn serializeU32_4(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 32>;

      fn log1_3(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 1;

        var serializedData0 = serializeU32_4(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeU32_4(_arg_1);
        dataBuffer_6[index].serializedData[1] = serializedData1[0];
        var serializedData2 = serializeU32_4(_arg_2);
        dataBuffer_6[index].serializedData[2] = serializedData2[0];
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(2, 3, 5);
      }

      struct mainCompute_Input_8 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_8)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn serializeBool_4(b: bool) -> array<u32,1>{
        return array<u32, 1>(u32(b));
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 32>;

      fn log1_3(_arg_0: bool) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 1;

        var serializedData0 = serializeBool_4(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
      }

      fn serializeU32_9(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn log2_8(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 2;

        var serializedData0 = serializeU32_9(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
      }

      fn serializeVec2u_11(v: vec2u) -> array<u32,2>{
        return array<u32, 2>(v.x, v.y);
      }

      fn log3_10(_arg_0: vec2u) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 3;

        var serializedData0 = serializeVec2u_11(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
        dataBuffer_6[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3u_13(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      fn log4_12(_arg_0: vec3u) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 4;

        var serializedData0 = serializeVec3u_13(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
        dataBuffer_6[index].serializedData[1] = serializedData0[1];
        dataBuffer_6[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4u_15(v: vec4u) -> array<u32,4>{
        return array<u32, 4>(v.x, v.y, v.z, v.w);
      }

      fn log5_14(_arg_0: vec4u) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 5;

        var serializedData0 = serializeVec4u_15(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
        dataBuffer_6[index].serializedData[1] = serializedData0[1];
        dataBuffer_6[index].serializedData[2] = serializedData0[2];
        dataBuffer_6[index].serializedData[3] = serializedData0[3];
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(true);
        log2_8(3000000000);
        log3_10(vec2u(1, 2));
        log4_12(vec3u(1, 2, 3));
        log5_14(vec4u(1, 2, 3, 4));
      }

      struct mainCompute_Input_16 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_16)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer_4: atomic<u32>;

      struct SerializedLogData_6 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 32>;

      fn log1_3() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 1;


      }

      fn log2_7() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 2;


      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3();
        log2_7();
      }

      struct mainCompute_Input_8 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_8)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn serializeU32_4(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 32>;

      fn log1_3(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 1;

        var serializedData0 = serializeU32_4(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_2(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(x);
      }

      struct mainCompute_Input_8 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_8)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn serializeU32_4(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 32>;

      fn log1_3(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 1;

        var serializedData0 = serializeU32_4(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
      }

      @group(0) @binding(3) var<uniform> indexUniform_8: u32;

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(indexUniform_8);
      }

      struct mainCompute_Input_9 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_9)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<uniform> logCountUniform_3: u32;

      fn serializeU32_5(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(2) var<storage, read_write> indexBuffer_6: atomic<u32>;

      struct SerializedLogData_8 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(3) var<storage, read_write> dataBuffer_7: array<SerializedLogData_8, 32>;

      fn log1_4(_arg_0: u32, _arg_1: u32) {
        var index = atomicAdd(&indexBuffer_6, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_7[index].id = 1;

        var serializedData0 = serializeU32_5(_arg_0);
        dataBuffer_7[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeU32_5(_arg_1);
        dataBuffer_7[index].serializedData[1] = serializedData1[0];
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        for (var i = 0u; (i < logCountUniform_3); i++) {
          log1_4((i + 1), logCountUniform_3);
        }
      }

      struct mainCompute_Input_9 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_9)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      struct mainVertex_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct mainVertex_Output_2 {
        @builtin(position) pos: vec4f,
      }

      @vertex fn mainVertex_0(input: mainVertex_Input_1) -> mainVertex_Output_2 {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5));
        return mainVertex_Output_2(vec4f(positions[input.vertexIndex], 0, 1));
      }

      struct mainFragment_Input_4 {
        @builtin(position) pos: vec4f,
      }

      fn serializeU32_6(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_7: atomic<u32>;

      struct SerializedLogData_9 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_8: array<SerializedLogData_9, 32>;

      fn log1_5(_arg_0: u32, _arg_1: u32) {
        var index = atomicAdd(&indexBuffer_7, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_8[index].id = 1;

        var serializedData0 = serializeU32_6(_arg_0);
        dataBuffer_8[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeU32_6(_arg_1);
        dataBuffer_8[index].serializedData[1] = serializedData1[0];
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_4) -> @location(0) vec4f {
        log1_5(u32(_arg_0.pos.x), u32(_arg_0.pos.y));
        return vec4f(0.7689999938011169, 0.3919999897480011, 1, 1);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn serializeU32_4(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 32>;

      fn log1_3(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 1;

        var serializedData0 = serializeU32_4(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
      }

      fn log2_8(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 2;

        var serializedData0 = serializeU32_4(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
      }

      fn log3_9(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_6[index].id = 3;

        var serializedData0 = serializeU32_4(_arg_0);
        dataBuffer_6[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_2(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(x);
        log2_8(x);
        log3_9(x);
      }

      struct mainCompute_Input_10 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_10)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }"
    `);
  });
});
