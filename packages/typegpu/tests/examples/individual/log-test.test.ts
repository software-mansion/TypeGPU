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
        serializedData: array<u32, 32>,
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
        serializedData: array<u32, 32>,
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
        serializedData: array<u32, 32>,
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

      @group(0) @binding(1) var<storage, read_write> indexBuffer_4: atomic<u32>;

      struct SerializedLogData_6 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 32>;

      fn log1_3() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 1;


      }

      fn serializeF32_8(n: f32) -> array<u32,1>{
        return array<u32, 1>(bitcast<u32>(n));
      }

      fn log2_7(_arg_0: f32) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 2;

        var serializedData0 = serializeF32_8(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
      }

      fn serializeF16_10(n: f16) -> array<u32,1>{
        return array<u32, 1>(pack2x16float(vec2f(f32(n))));
      }

      fn log3_9(_arg_0: f16) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 3;

        var serializedData0 = serializeF16_10(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
      }

      fn serializeI32_12(n: i32) -> array<u32,1>{
        return array<u32, 1>(bitcast<u32>(n));
      }

      fn log4_11(_arg_0: i32) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 4;

        var serializedData0 = serializeI32_12(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
      }

      fn serializeU32_14(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn log5_13(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 5;

        var serializedData0 = serializeU32_14(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
      }

      fn serializeBool_16(b: bool) -> array<u32,1>{
        return array<u32, 1>(u32(b));
      }

      fn log6_15(_arg_0: bool) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 6;

        var serializedData0 = serializeBool_16(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
      }

      fn log7_17() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 7;


      }

      fn log8_18() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 8;


      }

      fn serializeVec2f_20(v: vec2f) -> array<u32,2>{
        return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
      }

      fn log9_19(_arg_0: vec2f) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 9;

        var serializedData0 = serializeVec2f_20(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3f_22(v: vec3f) -> array<u32,3>{
        return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
      }

      fn log10_21(_arg_0: vec3f) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 10;

        var serializedData0 = serializeVec3f_22(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4f_24(v: vec4f) -> array<u32,4>{
        return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
      }

      fn log11_23(_arg_0: vec4f) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 11;

        var serializedData0 = serializeVec4f_24(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
        dataBuffer_5[index].serializedData[3] = serializedData0[3];
      }

      fn log12_25() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 12;


      }

      fn serializeVec2h_27(v: vec2h) -> array<u32,1>{
        return array<u32, 1>(pack2x16float(vec2f(f32(v.x), f32(v.y))));
      }

      fn log13_26(_arg_0: vec2h) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 13;

        var serializedData0 = serializeVec2h_27(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
      }

      fn serializeVec3h_29(v: vec3h) -> array<u32,2>{
        return array<u32, 2>(
          pack2x16float(vec2f(f32(v.x), f32(v.y))),
          pack2x16float(vec2f(f32(v.z), 0))
        );
      }

      fn log14_28(_arg_0: vec3h) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 14;

        var serializedData0 = serializeVec3h_29(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec4h_31(v: vec4h) -> array<u32,2>{
        return array<u32, 2>(
          pack2x16float(vec2f(f32(v.x), f32(v.y))),
          pack2x16float(vec2f(f32(v.z), f32(v.w)))
        );
      }

      fn log15_30(_arg_0: vec4h) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 15;

        var serializedData0 = serializeVec4h_31(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
      }

      fn log16_32() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 16;


      }

      fn serializeVec2i_34(v: vec2i) -> array<u32,2>{
        return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
      }

      fn log17_33(_arg_0: vec2i) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 17;

        var serializedData0 = serializeVec2i_34(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3i_36(v: vec3i) -> array<u32,3>{
        return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
      }

      fn log18_35(_arg_0: vec3i) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 18;

        var serializedData0 = serializeVec3i_36(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4i_38(v: vec4i) -> array<u32,4>{
        return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
      }

      fn log19_37(_arg_0: vec4i) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 19;

        var serializedData0 = serializeVec4i_38(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
        dataBuffer_5[index].serializedData[3] = serializedData0[3];
      }

      fn log20_39() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 20;


      }

      fn serializeVec2u_41(v: vec2u) -> array<u32,2>{
        return array<u32, 2>(v.x, v.y);
      }

      fn log21_40(_arg_0: vec2u) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 21;

        var serializedData0 = serializeVec2u_41(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3u_43(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      fn log22_42(_arg_0: vec3u) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 22;

        var serializedData0 = serializeVec3u_43(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4u_45(v: vec4u) -> array<u32,4>{
        return array<u32, 4>(v.x, v.y, v.z, v.w);
      }

      fn log23_44(_arg_0: vec4u) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 23;

        var serializedData0 = serializeVec4u_45(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
        dataBuffer_5[index].serializedData[3] = serializedData0[3];
      }

      fn log24_46() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 24;


      }

      fn serializeVec2bool_48(v: vec2<bool>) -> array<u32,2>{
        return array<u32, 2>(u32(v.x), u32(v.y));
      }

      fn log25_47(_arg_0: vec2<bool>) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 25;

        var serializedData0 = serializeVec2bool_48(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3bool_50(v: vec3<bool>) -> array<u32,3>{
        return array<u32, 3>(u32(v.x), u32(v.y), u32(v.z));
      }

      fn log26_49(_arg_0: vec3<bool>) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 26;

        var serializedData0 = serializeVec3bool_50(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4bool_52(v: vec4<bool>) -> array<u32,4>{
        return array<u32, 4>(u32(v.x), u32(v.y), u32(v.z), u32(v.w));
      }

      fn log27_51(_arg_0: vec4<bool>) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 27;

        var serializedData0 = serializeVec4bool_52(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
        dataBuffer_5[index].serializedData[3] = serializedData0[3];
      }

      fn log28_53() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 28;


      }

      fn log29_54() {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 29;


      }

      fn serializeMat2x2f_56(m: mat2x2f) -> array<u32,4>{
        return array<u32, 4>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]),
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1])
        );
      }

      fn log30_55(_arg_0: mat2x2f) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 30;

        var serializedData0 = serializeMat2x2f_56(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
        dataBuffer_5[index].serializedData[3] = serializedData0[3];
      }

      fn serializeMat3x3f_58(m: mat3x3f) -> array<u32,12>{
        return array<u32, 12>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]), bitcast<u32>(m[0][2]), 0,
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1]), bitcast<u32>(m[1][2]), 0,
          bitcast<u32>(m[2][0]), bitcast<u32>(m[2][1]), bitcast<u32>(m[2][2]), 0
        );
      }

      fn log31_57(_arg_0: mat3x3f) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 31;

        var serializedData0 = serializeMat3x3f_58(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
        dataBuffer_5[index].serializedData[3] = serializedData0[3];
        dataBuffer_5[index].serializedData[4] = serializedData0[4];
        dataBuffer_5[index].serializedData[5] = serializedData0[5];
        dataBuffer_5[index].serializedData[6] = serializedData0[6];
        dataBuffer_5[index].serializedData[7] = serializedData0[7];
        dataBuffer_5[index].serializedData[8] = serializedData0[8];
        dataBuffer_5[index].serializedData[9] = serializedData0[9];
        dataBuffer_5[index].serializedData[10] = serializedData0[10];
        dataBuffer_5[index].serializedData[11] = serializedData0[11];
      }

      fn serializeMat4x4f_60(m: mat4x4f) -> array<u32,16>{
        return array<u32, 16>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]), bitcast<u32>(m[0][2]), bitcast<u32>(m[0][3]),
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1]), bitcast<u32>(m[1][2]), bitcast<u32>(m[1][3]),
          bitcast<u32>(m[2][0]), bitcast<u32>(m[2][1]), bitcast<u32>(m[2][2]), bitcast<u32>(m[2][3]),
          bitcast<u32>(m[3][0]), bitcast<u32>(m[3][1]), bitcast<u32>(m[3][2]), bitcast<u32>(m[3][3])
        );
      }

      fn log32_59(_arg_0: mat4x4f) {
        var index = atomicAdd(&indexBuffer_4, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_5[index].id = 32;

        var serializedData0 = serializeMat4x4f_60(_arg_0);
        dataBuffer_5[index].serializedData[0] = serializedData0[0];
        dataBuffer_5[index].serializedData[1] = serializedData0[1];
        dataBuffer_5[index].serializedData[2] = serializedData0[2];
        dataBuffer_5[index].serializedData[3] = serializedData0[3];
        dataBuffer_5[index].serializedData[4] = serializedData0[4];
        dataBuffer_5[index].serializedData[5] = serializedData0[5];
        dataBuffer_5[index].serializedData[6] = serializedData0[6];
        dataBuffer_5[index].serializedData[7] = serializedData0[7];
        dataBuffer_5[index].serializedData[8] = serializedData0[8];
        dataBuffer_5[index].serializedData[9] = serializedData0[9];
        dataBuffer_5[index].serializedData[10] = serializedData0[10];
        dataBuffer_5[index].serializedData[11] = serializedData0[11];
        dataBuffer_5[index].serializedData[12] = serializedData0[12];
        dataBuffer_5[index].serializedData[13] = serializedData0[13];
        dataBuffer_5[index].serializedData[14] = serializedData0[14];
        dataBuffer_5[index].serializedData[15] = serializedData0[15];
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3();
        log2_7(3.140000104904175);
        log3_9(3.140625);
        log4_11(i32(-2000000000));
        log5_13(3000000000);
        log6_15(true);
        log7_17();
        log8_18();
        log9_19(vec2f(1.1, -2.2));
        log10_21(vec3f(10.1, -20.2, 30.3));
        log11_23(vec4f(100.1, -200.2, 300.3, -400.4));
        log12_25();
        log13_26(vec2h(1.1, -2.2));
        log14_28(vec3h(10.1, -20.2, 30.3));
        log15_30(vec4h(100.1, -200.2, 300.3, -400.4));
        log16_32();
        log17_33(vec2i(-1, -2));
        log18_35(vec3i(-1, -2, -3));
        log19_37(vec4i(-1, -2, -3, -4));
        log20_39();
        log21_40(vec2u(1, 2));
        log22_42(vec3u(1, 2, 3));
        log23_44(vec4u(1, 2, 3, 4));
        log24_46();
        log25_47(vec2<bool>(true, false));
        log26_49(vec3<bool>(true, false, true));
        log27_51(vec4<bool>(true, false, true, false));
        log28_53();
        log29_54();
        log30_55(mat2x2f(0, 0.25, 0.5, 0.75));
        log31_57(mat3x3f(0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5));
        log32_59(mat4x4f(0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75));
      }

      struct mainCompute_Input_61 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_61)  {
          if (any(in.id >= sizeUniform_1)) {
            return;
          }
          wrappedCallback_2(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer_4: atomic<u32>;

      struct SerializedLogData_6 {
        id: u32,
        serializedData: array<u32, 32>,
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
        serializedData: array<u32, 32>,
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
        serializedData: array<u32, 32>,
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
        serializedData: array<u32, 32>,
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
        serializedData: array<u32, 32>,
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
        serializedData: array<u32, 32>,
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
