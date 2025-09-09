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
        'Render pipeline',
        'Too many logs',
        // 'Too much data', // this one throws an error
      ],
      expectedCalls: 9,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn serializeU32_4(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> logCallIndexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> serializedLogDataBuffer_6: array<SerializedLogData_7, 32>;

      fn log1_3(_arg_0: u32) {
        var index = atomicAdd(&logCallIndexBuffer_5, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_6[index].id = 1;

        var serializedData0 = serializeU32_4(_arg_0);
        serializedLogDataBuffer_6[index].serializedData[0] = serializedData0[0];
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

      @group(0) @binding(0) var<uniform> sizeUniform_10: vec3u;

      fn serializeU32_13(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn serializeVec3u_14(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      @group(0) @binding(1) var<storage, read_write> logCallIndexBuffer_15: atomic<u32>;

      struct SerializedLogData_17 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> serializedLogDataBuffer_16: array<SerializedLogData_17, 32>;

      fn log1_12(_arg_0: u32, _arg_1: vec3u, _arg_2: u32, _arg_3: u32) {
        var index = atomicAdd(&logCallIndexBuffer_15, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_16[index].id = 1;

        var serializedData0 = serializeU32_13(_arg_0);
        serializedLogDataBuffer_16[index].serializedData[0] = serializedData0[0];

        var serializedData1 = serializeVec3u_14(_arg_1);
        serializedLogDataBuffer_16[index].serializedData[1] = serializedData1[0];
        serializedLogDataBuffer_16[index].serializedData[2] = serializedData1[1];
        serializedLogDataBuffer_16[index].serializedData[3] = serializedData1[2];

        var serializedData2 = serializeU32_13(_arg_2);
        serializedLogDataBuffer_16[index].serializedData[4] = serializedData2[0];

        var serializedData3 = serializeU32_13(_arg_3);
        serializedLogDataBuffer_16[index].serializedData[5] = serializedData3[0];
      }

      fn wrappedCallback_11(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_12(1, vec3u(2, 3, 4), 5, 6);
      }

      struct mainCompute_Input_18 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_9(in: mainCompute_Input_18)  {
          if (any(in.id >= sizeUniform_10)) {
            return;
          }
          wrappedCallback_11(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_20: vec3u;

      fn serializeU32_23(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> logCallIndexBuffer_24: atomic<u32>;

      struct SerializedLogData_26 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> serializedLogDataBuffer_25: array<SerializedLogData_26, 32>;

      fn log1_22(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        var index = atomicAdd(&logCallIndexBuffer_24, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_25[index].id = 1;

        var serializedData0 = serializeU32_23(_arg_0);
        serializedLogDataBuffer_25[index].serializedData[0] = serializedData0[0];

        var serializedData1 = serializeU32_23(_arg_1);
        serializedLogDataBuffer_25[index].serializedData[1] = serializedData1[0];

        var serializedData2 = serializeU32_23(_arg_2);
        serializedLogDataBuffer_25[index].serializedData[2] = serializedData2[0];
      }

      fn wrappedCallback_21(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_22(2, 3, 5);
      }

      struct mainCompute_Input_27 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_19(in: mainCompute_Input_27)  {
          if (any(in.id >= sizeUniform_20)) {
            return;
          }
          wrappedCallback_21(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_29: vec3u;

      fn serializeBool_32(b: bool) -> array<u32,1>{
        return array<u32, 1>(u32(b));
      }

      @group(0) @binding(1) var<storage, read_write> logCallIndexBuffer_33: atomic<u32>;

      struct SerializedLogData_35 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> serializedLogDataBuffer_34: array<SerializedLogData_35, 32>;

      fn log1_31(_arg_0: bool) {
        var index = atomicAdd(&logCallIndexBuffer_33, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_34[index].id = 1;

        var serializedData0 = serializeBool_32(_arg_0);
        serializedLogDataBuffer_34[index].serializedData[0] = serializedData0[0];
      }

      fn serializeU32_37(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn log2_36(_arg_0: u32) {
        var index = atomicAdd(&logCallIndexBuffer_33, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_34[index].id = 2;

        var serializedData0 = serializeU32_37(_arg_0);
        serializedLogDataBuffer_34[index].serializedData[0] = serializedData0[0];
      }

      fn serializeVec2u_39(v: vec2u) -> array<u32,2>{
        return array<u32, 2>(v.x, v.y);
      }

      fn log3_38(_arg_0: vec2u) {
        var index = atomicAdd(&logCallIndexBuffer_33, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_34[index].id = 3;

        var serializedData0 = serializeVec2u_39(_arg_0);
        serializedLogDataBuffer_34[index].serializedData[0] = serializedData0[0];
        serializedLogDataBuffer_34[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3u_41(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      fn log4_40(_arg_0: vec3u) {
        var index = atomicAdd(&logCallIndexBuffer_33, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_34[index].id = 4;

        var serializedData0 = serializeVec3u_41(_arg_0);
        serializedLogDataBuffer_34[index].serializedData[0] = serializedData0[0];
        serializedLogDataBuffer_34[index].serializedData[1] = serializedData0[1];
        serializedLogDataBuffer_34[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4u_43(v: vec4u) -> array<u32,4>{
        return array<u32, 4>(v.x, v.y, v.z, v.w);
      }

      fn log5_42(_arg_0: vec4u) {
        var index = atomicAdd(&logCallIndexBuffer_33, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_34[index].id = 5;

        var serializedData0 = serializeVec4u_43(_arg_0);
        serializedLogDataBuffer_34[index].serializedData[0] = serializedData0[0];
        serializedLogDataBuffer_34[index].serializedData[1] = serializedData0[1];
        serializedLogDataBuffer_34[index].serializedData[2] = serializedData0[2];
        serializedLogDataBuffer_34[index].serializedData[3] = serializedData0[3];
      }

      fn wrappedCallback_30(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_31(true);
        log2_36(3000000000);
        log3_38(vec2u(1, 2));
        log4_40(vec3u(1, 2, 3));
        log5_42(vec4u(1, 2, 3, 4));
      }

      struct mainCompute_Input_44 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_28(in: mainCompute_Input_44)  {
          if (any(in.id >= sizeUniform_29)) {
            return;
          }
          wrappedCallback_30(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_46: vec3u;

      @group(0) @binding(1) var<storage, read_write> logCallIndexBuffer_49: atomic<u32>;

      struct SerializedLogData_51 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> serializedLogDataBuffer_50: array<SerializedLogData_51, 32>;

      fn log1_48() {
        var index = atomicAdd(&logCallIndexBuffer_49, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_50[index].id = 1;

      }

      fn log2_52() {
        var index = atomicAdd(&logCallIndexBuffer_49, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_50[index].id = 2;

      }

      fn wrappedCallback_47(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_48();
        log2_52();
      }

      struct mainCompute_Input_53 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_45(in: mainCompute_Input_53)  {
          if (any(in.id >= sizeUniform_46)) {
            return;
          }
          wrappedCallback_47(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_55: vec3u;

      fn serializeU32_58(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> logCallIndexBuffer_59: atomic<u32>;

      struct SerializedLogData_61 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> serializedLogDataBuffer_60: array<SerializedLogData_61, 32>;

      fn log1_57(_arg_0: u32) {
        var index = atomicAdd(&logCallIndexBuffer_59, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_60[index].id = 1;

        var serializedData0 = serializeU32_58(_arg_0);
        serializedLogDataBuffer_60[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_56(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_57(x);
      }

      struct mainCompute_Input_62 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_54(in: mainCompute_Input_62)  {
          if (any(in.id >= sizeUniform_55)) {
            return;
          }
          wrappedCallback_56(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_64: vec3u;

      fn serializeU32_67(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> logCallIndexBuffer_68: atomic<u32>;

      struct SerializedLogData_70 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> serializedLogDataBuffer_69: array<SerializedLogData_70, 32>;

      fn log1_66(_arg_0: u32) {
        var index = atomicAdd(&logCallIndexBuffer_68, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_69[index].id = 1;

        var serializedData0 = serializeU32_67(_arg_0);
        serializedLogDataBuffer_69[index].serializedData[0] = serializedData0[0];
      }

      @group(0) @binding(3) var<uniform> indexUniform_71: u32;

      fn wrappedCallback_65(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_66(indexUniform_71);
      }

      struct mainCompute_Input_72 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_63(in: mainCompute_Input_72)  {
          if (any(in.id >= sizeUniform_64)) {
            return;
          }
          wrappedCallback_65(in.id.x, in.id.y, in.id.z);
        }

      struct mainVertex_Input_74 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct mainVertex_Output_75 {
        @builtin(position) pos: vec4f,
      }

      @vertex fn mainVertex_73(input: mainVertex_Input_74) -> mainVertex_Output_75 {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5));
        return mainVertex_Output_75(vec4f(positions[input.vertexIndex], 0, 1));
      }

      struct mainFragment_Input_77 {
        @builtin(position) pos: vec4f,
      }

      fn serializeU32_79(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> logCallIndexBuffer_80: atomic<u32>;

      struct SerializedLogData_82 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(1) var<storage, read_write> serializedLogDataBuffer_81: array<SerializedLogData_82, 32>;

      fn log1_78(_arg_0: u32, _arg_1: u32) {
        var index = atomicAdd(&logCallIndexBuffer_80, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_81[index].id = 1;

        var serializedData0 = serializeU32_79(_arg_0);
        serializedLogDataBuffer_81[index].serializedData[0] = serializedData0[0];

        var serializedData1 = serializeU32_79(_arg_1);
        serializedLogDataBuffer_81[index].serializedData[1] = serializedData1[0];
      }

      @fragment fn mainFragment_76(_arg_0: mainFragment_Input_77) -> @location(0) vec4f {
        log1_78(u32(_arg_0.pos.x), u32(_arg_0.pos.y));
        return vec4f(0.7689999938011169, 0.3919999897480011, 1, 1);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_84: vec3u;

      fn serializeU32_87(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> logCallIndexBuffer_88: atomic<u32>;

      struct SerializedLogData_90 {
        id: u32,
        serializedData: array<u32, 8>,
      }

      @group(0) @binding(2) var<storage, read_write> serializedLogDataBuffer_89: array<SerializedLogData_90, 32>;

      fn log1_86(_arg_0: u32) {
        var index = atomicAdd(&logCallIndexBuffer_88, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_89[index].id = 1;

        var serializedData0 = serializeU32_87(_arg_0);
        serializedLogDataBuffer_89[index].serializedData[0] = serializedData0[0];
      }

      fn log2_91(_arg_0: u32) {
        var index = atomicAdd(&logCallIndexBuffer_88, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_89[index].id = 2;

        var serializedData0 = serializeU32_87(_arg_0);
        serializedLogDataBuffer_89[index].serializedData[0] = serializedData0[0];
      }

      fn log3_92(_arg_0: u32) {
        var index = atomicAdd(&logCallIndexBuffer_88, 1);
        if (index >= 32) {
          return;
        }
        serializedLogDataBuffer_89[index].id = 3;

        var serializedData0 = serializeU32_87(_arg_0);
        serializedLogDataBuffer_89[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_85(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_86(x);
        log2_91(x);
        log3_92(x);
      }

      struct mainCompute_Input_93 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_83(in: mainCompute_Input_93)  {
          if (any(in.id >= sizeUniform_84)) {
            return;
          }
          wrappedCallback_85(in.id.x, in.id.y, in.id.z);
        }"
    `);
  });
});
