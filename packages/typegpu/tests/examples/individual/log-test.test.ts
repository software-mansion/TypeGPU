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

      @group(0) @binding(0) var<uniform> sizeUniform_10: vec3u;

      fn serializeU32_13(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn serializeVec3u_14(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_15: atomic<u32>;

      struct SerializedLogData_17 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_16: array<SerializedLogData_17, 32>;

      fn log1_12(_arg_0: u32, _arg_1: vec3u, _arg_2: u32, _arg_3: u32) {
        var index = atomicAdd(&indexBuffer_15, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_16[index].id = 1;

        var serializedData0 = serializeU32_13(_arg_0);
        dataBuffer_16[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeVec3u_14(_arg_1);
        dataBuffer_16[index].serializedData[1] = serializedData1[0];
        dataBuffer_16[index].serializedData[2] = serializedData1[1];
        dataBuffer_16[index].serializedData[3] = serializedData1[2];
        var serializedData2 = serializeU32_13(_arg_2);
        dataBuffer_16[index].serializedData[4] = serializedData2[0];
        var serializedData3 = serializeU32_13(_arg_3);
        dataBuffer_16[index].serializedData[5] = serializedData3[0];
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

      @group(0) @binding(1) var<storage, read_write> indexBuffer_24: atomic<u32>;

      struct SerializedLogData_26 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_25: array<SerializedLogData_26, 32>;

      fn log1_22(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        var index = atomicAdd(&indexBuffer_24, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_25[index].id = 1;

        var serializedData0 = serializeU32_23(_arg_0);
        dataBuffer_25[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeU32_23(_arg_1);
        dataBuffer_25[index].serializedData[1] = serializedData1[0];
        var serializedData2 = serializeU32_23(_arg_2);
        dataBuffer_25[index].serializedData[2] = serializedData2[0];
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

      @group(0) @binding(1) var<storage, read_write> indexBuffer_32: atomic<u32>;

      struct SerializedLogData_34 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_33: array<SerializedLogData_34, 32>;

      fn log1_31() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 1;


      }

      fn serializeF32_36(n: f32) -> array<u32,1>{
        return array<u32, 1>(bitcast<u32>(n));
      }

      fn log2_35(_arg_0: f32) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 2;

        var serializedData0 = serializeF32_36(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn serializeF16_38(n: f16) -> array<u32,1>{
        return array<u32, 1>(pack2x16float(vec2f(f32(n))));
      }

      fn log3_37(_arg_0: f16) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 3;

        var serializedData0 = serializeF16_38(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn serializeI32_40(n: i32) -> array<u32,1>{
        return array<u32, 1>(bitcast<u32>(n));
      }

      fn log4_39(_arg_0: i32) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 4;

        var serializedData0 = serializeI32_40(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn serializeU32_42(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn log5_41(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 5;

        var serializedData0 = serializeU32_42(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn serializeBool_44(b: bool) -> array<u32,1>{
        return array<u32, 1>(u32(b));
      }

      fn log6_43(_arg_0: bool) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 6;

        var serializedData0 = serializeBool_44(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn log7_45() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 7;


      }

      fn log8_46() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 8;


      }

      fn serializeVec2f_48(v: vec2f) -> array<u32,2>{
        return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
      }

      fn log9_47(_arg_0: vec2f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 9;

        var serializedData0 = serializeVec2f_48(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3f_50(v: vec3f) -> array<u32,3>{
        return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
      }

      fn log10_49(_arg_0: vec3f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 10;

        var serializedData0 = serializeVec3f_50(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4f_52(v: vec4f) -> array<u32,4>{
        return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
      }

      fn log11_51(_arg_0: vec4f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 11;

        var serializedData0 = serializeVec4f_52(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
        dataBuffer_33[index].serializedData[3] = serializedData0[3];
      }

      fn log12_53() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 12;


      }

      fn serializeVec2h_55(v: vec2h) -> array<u32,1>{
        return array<u32, 1>(pack2x16float(vec2f(f32(v.x), f32(v.y))));
      }

      fn log13_54(_arg_0: vec2h) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 13;

        var serializedData0 = serializeVec2h_55(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn serializeVec3h_57(v: vec3h) -> array<u32,2>{
        return array<u32, 2>(
          pack2x16float(vec2f(f32(v.x), f32(v.y))),
          pack2x16float(vec2f(f32(v.z), 0))
        );
      }

      fn log14_56(_arg_0: vec3h) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 14;

        var serializedData0 = serializeVec3h_57(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec4h_59(v: vec4h) -> array<u32,2>{
        return array<u32, 2>(
          pack2x16float(vec2f(f32(v.x), f32(v.y))),
          pack2x16float(vec2f(f32(v.z), f32(v.w)))
        );
      }

      fn log15_58(_arg_0: vec4h) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 15;

        var serializedData0 = serializeVec4h_59(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn log16_60() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 16;


      }

      fn serializeVec2i_62(v: vec2i) -> array<u32,2>{
        return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
      }

      fn log17_61(_arg_0: vec2i) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 17;

        var serializedData0 = serializeVec2i_62(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3i_64(v: vec3i) -> array<u32,3>{
        return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
      }

      fn log18_63(_arg_0: vec3i) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 18;

        var serializedData0 = serializeVec3i_64(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4i_66(v: vec4i) -> array<u32,4>{
        return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
      }

      fn log19_65(_arg_0: vec4i) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 19;

        var serializedData0 = serializeVec4i_66(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
        dataBuffer_33[index].serializedData[3] = serializedData0[3];
      }

      fn log20_67() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 20;


      }

      fn serializeVec2u_69(v: vec2u) -> array<u32,2>{
        return array<u32, 2>(v.x, v.y);
      }

      fn log21_68(_arg_0: vec2u) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 21;

        var serializedData0 = serializeVec2u_69(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3u_71(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      fn log22_70(_arg_0: vec3u) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 22;

        var serializedData0 = serializeVec3u_71(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4u_73(v: vec4u) -> array<u32,4>{
        return array<u32, 4>(v.x, v.y, v.z, v.w);
      }

      fn log23_72(_arg_0: vec4u) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 23;

        var serializedData0 = serializeVec4u_73(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
        dataBuffer_33[index].serializedData[3] = serializedData0[3];
      }

      fn log24_74() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 24;


      }

      fn serializeVec2bool_76(v: vec2<bool>) -> array<u32,2>{
        return array<u32, 2>(u32(v.x), u32(v.y));
      }

      fn log25_75(_arg_0: vec2<bool>) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 25;

        var serializedData0 = serializeVec2bool_76(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn serializeVec3bool_78(v: vec3<bool>) -> array<u32,3>{
        return array<u32, 3>(u32(v.x), u32(v.y), u32(v.z));
      }

      fn log26_77(_arg_0: vec3<bool>) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 26;

        var serializedData0 = serializeVec3bool_78(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
      }

      fn serializeVec4bool_80(v: vec4<bool>) -> array<u32,4>{
        return array<u32, 4>(u32(v.x), u32(v.y), u32(v.z), u32(v.w));
      }

      fn log27_79(_arg_0: vec4<bool>) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 27;

        var serializedData0 = serializeVec4bool_80(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
        dataBuffer_33[index].serializedData[3] = serializedData0[3];
      }

      fn log28_81() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 28;


      }

      fn log29_82() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 29;


      }

      fn serializeMat2x2f_84(m: mat2x2f) -> array<u32,4>{
        return array<u32, 4>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]),
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1])
        );
      }

      fn log30_83(_arg_0: mat2x2f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 30;

        var serializedData0 = serializeMat2x2f_84(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
        dataBuffer_33[index].serializedData[3] = serializedData0[3];
      }

      fn serializeMat3x3f_86(m: mat3x3f) -> array<u32,12>{
        return array<u32, 12>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]), bitcast<u32>(m[0][2]), 0,
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1]), bitcast<u32>(m[1][2]), 0,
          bitcast<u32>(m[2][0]), bitcast<u32>(m[2][1]), bitcast<u32>(m[2][2]), 0
        );
      }

      fn log31_85(_arg_0: mat3x3f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 31;

        var serializedData0 = serializeMat3x3f_86(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
        dataBuffer_33[index].serializedData[3] = serializedData0[3];
        dataBuffer_33[index].serializedData[4] = serializedData0[4];
        dataBuffer_33[index].serializedData[5] = serializedData0[5];
        dataBuffer_33[index].serializedData[6] = serializedData0[6];
        dataBuffer_33[index].serializedData[7] = serializedData0[7];
        dataBuffer_33[index].serializedData[8] = serializedData0[8];
        dataBuffer_33[index].serializedData[9] = serializedData0[9];
        dataBuffer_33[index].serializedData[10] = serializedData0[10];
        dataBuffer_33[index].serializedData[11] = serializedData0[11];
      }

      fn serializeMat4x4f_88(m: mat4x4f) -> array<u32,16>{
        return array<u32, 16>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]), bitcast<u32>(m[0][2]), bitcast<u32>(m[0][3]),
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1]), bitcast<u32>(m[1][2]), bitcast<u32>(m[1][3]),
          bitcast<u32>(m[2][0]), bitcast<u32>(m[2][1]), bitcast<u32>(m[2][2]), bitcast<u32>(m[2][3]),
          bitcast<u32>(m[3][0]), bitcast<u32>(m[3][1]), bitcast<u32>(m[3][2]), bitcast<u32>(m[3][3])
        );
      }

      fn log32_87(_arg_0: mat4x4f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 32;

        var serializedData0 = serializeMat4x4f_88(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
        dataBuffer_33[index].serializedData[3] = serializedData0[3];
        dataBuffer_33[index].serializedData[4] = serializedData0[4];
        dataBuffer_33[index].serializedData[5] = serializedData0[5];
        dataBuffer_33[index].serializedData[6] = serializedData0[6];
        dataBuffer_33[index].serializedData[7] = serializedData0[7];
        dataBuffer_33[index].serializedData[8] = serializedData0[8];
        dataBuffer_33[index].serializedData[9] = serializedData0[9];
        dataBuffer_33[index].serializedData[10] = serializedData0[10];
        dataBuffer_33[index].serializedData[11] = serializedData0[11];
        dataBuffer_33[index].serializedData[12] = serializedData0[12];
        dataBuffer_33[index].serializedData[13] = serializedData0[13];
        dataBuffer_33[index].serializedData[14] = serializedData0[14];
        dataBuffer_33[index].serializedData[15] = serializedData0[15];
      }

      fn wrappedCallback_30(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_31();
        log2_35(3.140000104904175);
        log3_37(3.140625);
        log4_39(i32(-2000000000));
        log5_41(3000000000);
        log6_43(true);
        log7_45();
        log8_46();
        log9_47(vec2f(1.1, -2.2));
        log10_49(vec3f(10.1, -20.2, 30.3));
        log11_51(vec4f(100.1, -200.2, 300.3, -400.4));
        log12_53();
        log13_54(vec2h(1.1, -2.2));
        log14_56(vec3h(10.1, -20.2, 30.3));
        log15_58(vec4h(100.1, -200.2, 300.3, -400.4));
        log16_60();
        log17_61(vec2i(-1, -2));
        log18_63(vec3i(-1, -2, -3));
        log19_65(vec4i(-1, -2, -3, -4));
        log20_67();
        log21_68(vec2u(1, 2));
        log22_70(vec3u(1, 2, 3));
        log23_72(vec4u(1, 2, 3, 4));
        log24_74();
        log25_75(vec2<bool>(true, false));
        log26_77(vec3<bool>(true, false, true));
        log27_79(vec4<bool>(true, false, true, false));
        log28_81();
        log29_82();
        log30_83(mat2x2f(0, 0.25, 0.5, 0.75));
        log31_85(mat3x3f(0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5));
        log32_87(mat4x4f(0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75));
      }

      struct mainCompute_Input_89 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_28(in: mainCompute_Input_89)  {
          if (any(in.id >= sizeUniform_29)) {
            return;
          }
          wrappedCallback_30(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_91: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer_94: atomic<u32>;

      struct SerializedLogData_96 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_95: array<SerializedLogData_96, 32>;

      fn log1_93() {
        var index = atomicAdd(&indexBuffer_94, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_95[index].id = 1;


      }

      fn log2_97() {
        var index = atomicAdd(&indexBuffer_94, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_95[index].id = 2;


      }

      fn wrappedCallback_92(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_93();
        log2_97();
      }

      struct mainCompute_Input_98 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_90(in: mainCompute_Input_98)  {
          if (any(in.id >= sizeUniform_91)) {
            return;
          }
          wrappedCallback_92(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_100: vec3u;

      fn serializeU32_103(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_104: atomic<u32>;

      struct SerializedLogData_106 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_105: array<SerializedLogData_106, 32>;

      fn log1_102(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_104, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_105[index].id = 1;

        var serializedData0 = serializeU32_103(_arg_0);
        dataBuffer_105[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_101(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_102(x);
      }

      struct mainCompute_Input_107 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_99(in: mainCompute_Input_107)  {
          if (any(in.id >= sizeUniform_100)) {
            return;
          }
          wrappedCallback_101(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_109: vec3u;

      fn serializeU32_112(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_113: atomic<u32>;

      struct SerializedLogData_115 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_114: array<SerializedLogData_115, 32>;

      fn log1_111(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_113, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_114[index].id = 1;

        var serializedData0 = serializeU32_112(_arg_0);
        dataBuffer_114[index].serializedData[0] = serializedData0[0];
      }

      @group(0) @binding(3) var<uniform> indexUniform_116: u32;

      fn wrappedCallback_110(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_111(indexUniform_116);
      }

      struct mainCompute_Input_117 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_108(in: mainCompute_Input_117)  {
          if (any(in.id >= sizeUniform_109)) {
            return;
          }
          wrappedCallback_110(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_119: vec3u;

      @group(0) @binding(1) var<uniform> logCountUniform_121: u32;

      fn serializeU32_123(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(2) var<storage, read_write> indexBuffer_124: atomic<u32>;

      struct SerializedLogData_126 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(3) var<storage, read_write> dataBuffer_125: array<SerializedLogData_126, 32>;

      fn log1_122(_arg_0: u32, _arg_1: u32) {
        var index = atomicAdd(&indexBuffer_124, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_125[index].id = 1;

        var serializedData0 = serializeU32_123(_arg_0);
        dataBuffer_125[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeU32_123(_arg_1);
        dataBuffer_125[index].serializedData[1] = serializedData1[0];
      }

      fn wrappedCallback_120(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        for (var i = 0u; (i < logCountUniform_121); i++) {
          log1_122((i + 1), logCountUniform_121);
        }
      }

      struct mainCompute_Input_127 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_118(in: mainCompute_Input_127)  {
          if (any(in.id >= sizeUniform_119)) {
            return;
          }
          wrappedCallback_120(in.id.x, in.id.y, in.id.z);
        }

      struct mainVertex_Input_129 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct mainVertex_Output_130 {
        @builtin(position) pos: vec4f,
      }

      @vertex fn mainVertex_128(input: mainVertex_Input_129) -> mainVertex_Output_130 {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5));
        return mainVertex_Output_130(vec4f(positions[input.vertexIndex], 0, 1));
      }

      struct mainFragment_Input_132 {
        @builtin(position) pos: vec4f,
      }

      fn serializeU32_134(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_135: atomic<u32>;

      struct SerializedLogData_137 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_136: array<SerializedLogData_137, 32>;

      fn log1_133(_arg_0: u32, _arg_1: u32) {
        var index = atomicAdd(&indexBuffer_135, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_136[index].id = 1;

        var serializedData0 = serializeU32_134(_arg_0);
        dataBuffer_136[index].serializedData[0] = serializedData0[0];
        var serializedData1 = serializeU32_134(_arg_1);
        dataBuffer_136[index].serializedData[1] = serializedData1[0];
      }

      @fragment fn mainFragment_131(_arg_0: mainFragment_Input_132) -> @location(0) vec4f {
        log1_133(u32(_arg_0.pos.x), u32(_arg_0.pos.y));
        return vec4f(0.7689999938011169, 0.3919999897480011, 1, 1);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_139: vec3u;

      fn serializeU32_142(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_143: atomic<u32>;

      struct SerializedLogData_145 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_144: array<SerializedLogData_145, 32>;

      fn log1_141(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_143, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_144[index].id = 1;

        var serializedData0 = serializeU32_142(_arg_0);
        dataBuffer_144[index].serializedData[0] = serializedData0[0];
      }

      fn log2_146(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_143, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_144[index].id = 2;

        var serializedData0 = serializeU32_142(_arg_0);
        dataBuffer_144[index].serializedData[0] = serializedData0[0];
      }

      fn log3_147(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_143, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_144[index].id = 3;

        var serializedData0 = serializeU32_142(_arg_0);
        dataBuffer_144[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_140(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_141(x);
        log2_146(x);
        log3_147(x);
      }

      struct mainCompute_Input_148 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_138(in: mainCompute_Input_148)  {
          if (any(in.id >= sizeUniform_139)) {
            return;
          }
          wrappedCallback_140(in.id.x, in.id.y, in.id.z);
        }"
    `);
  });
});
