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

      fn u32_4(n: u32) -> array<u32,1>{
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

        var serializedData0 = u32_4(_arg_0);
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

      fn u32_13(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn vec3u_14(v: vec3u) -> array<u32,3>{
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

        var serializedData0 = u32_13(_arg_0);
        dataBuffer_16[index].serializedData[0] = serializedData0[0];
        var serializedData1 = vec3u_14(_arg_1);
        dataBuffer_16[index].serializedData[1] = serializedData1[0];
        dataBuffer_16[index].serializedData[2] = serializedData1[1];
        dataBuffer_16[index].serializedData[3] = serializedData1[2];
        var serializedData2 = u32_13(_arg_2);
        dataBuffer_16[index].serializedData[4] = serializedData2[0];
        var serializedData3 = u32_13(_arg_3);
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

      fn u32_23(n: u32) -> array<u32,1>{
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

        var serializedData0 = u32_23(_arg_0);
        dataBuffer_25[index].serializedData[0] = serializedData0[0];
        var serializedData1 = u32_23(_arg_1);
        dataBuffer_25[index].serializedData[1] = serializedData1[0];
        var serializedData2 = u32_23(_arg_2);
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

      fn bool_36(b: bool) -> array<u32,1>{
        return array<u32, 1>(u32(b));
      }

      fn log2_35(_arg_0: bool) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 2;

        var serializedData0 = bool_36(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn f32_38(n: f32) -> array<u32,1>{
        return array<u32, 1>(bitcast<u32>(n));
      }

      fn log3_37(_arg_0: f32) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 3;

        var serializedData0 = f32_38(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn f16_40(n: f16) -> array<u32,1>{
        return array<u32, 1>(pack2x16float(vec2f(f32(n))));
      }

      fn log4_39(_arg_0: f16) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 4;

        var serializedData0 = f16_40(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn i32_42(n: i32) -> array<u32,1>{
        return array<u32, 1>(bitcast<u32>(n));
      }

      fn log5_41(_arg_0: i32) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 5;

        var serializedData0 = i32_42(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn u32_44(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      fn log6_43(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 6;

        var serializedData0 = u32_44(_arg_0);
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

      fn vec2f_48(v: vec2f) -> array<u32,2>{
        return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
      }

      fn log9_47(_arg_0: vec2f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 9;

        var serializedData0 = vec2f_48(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn vec3f_50(v: vec3f) -> array<u32,3>{
        return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
      }

      fn log10_49(_arg_0: vec3f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 10;

        var serializedData0 = vec3f_50(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
      }

      fn vec4f_52(v: vec4f) -> array<u32,4>{
        return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
      }

      fn log11_51(_arg_0: vec4f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 11;

        var serializedData0 = vec4f_52(_arg_0);
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

      fn vec2h_55(v: vec2h) -> array<u32,1>{
        return array<u32, 1>(pack2x16float(vec2f(f32(v.x), f32(v.y))));
      }

      fn log13_54(_arg_0: vec2h) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 13;

        var serializedData0 = vec2h_55(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
      }

      fn vec3h_57(v: vec3h) -> array<u32,2>{
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

        var serializedData0 = vec3h_57(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn vec4h_59(v: vec4h) -> array<u32,2>{
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

        var serializedData0 = vec4h_59(_arg_0);
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

      fn vec2i_62(v: vec2i) -> array<u32,2>{
        return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
      }

      fn log17_61(_arg_0: vec2i) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 17;

        var serializedData0 = vec2i_62(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn vec3i_64(v: vec3i) -> array<u32,3>{
        return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
      }

      fn log18_63(_arg_0: vec3i) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 18;

        var serializedData0 = vec3i_64(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
      }

      fn vec4i_66(v: vec4i) -> array<u32,4>{
        return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
      }

      fn log19_65(_arg_0: vec4i) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 19;

        var serializedData0 = vec4i_66(_arg_0);
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

      fn vec2u_69(v: vec2u) -> array<u32,2>{
        return array<u32, 2>(v.x, v.y);
      }

      fn log21_68(_arg_0: vec2u) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 21;

        var serializedData0 = vec2u_69(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
      }

      fn vec3u_71(v: vec3u) -> array<u32,3>{
        return array<u32, 3>(v.x, v.y, v.z);
      }

      fn log22_70(_arg_0: vec3u) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 22;

        var serializedData0 = vec3u_71(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
      }

      fn vec4u_73(v: vec4u) -> array<u32,4>{
        return array<u32, 4>(v.x, v.y, v.z, v.w);
      }

      fn log23_72(_arg_0: vec4u) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 23;

        var serializedData0 = vec4u_73(_arg_0);
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

      fn log25_75() {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 25;


      }

      fn mat2x2f_77(m: mat2x2f) -> array<u32,4>{
        return array<u32, 4>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]),
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1])
        );
      }

      fn log26_76(_arg_0: mat2x2f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 26;

        var serializedData0 = mat2x2f_77(_arg_0);
        dataBuffer_33[index].serializedData[0] = serializedData0[0];
        dataBuffer_33[index].serializedData[1] = serializedData0[1];
        dataBuffer_33[index].serializedData[2] = serializedData0[2];
        dataBuffer_33[index].serializedData[3] = serializedData0[3];
      }

      fn mat3x3f_79(m: mat3x3f) -> array<u32,12>{
        return array<u32, 12>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]), bitcast<u32>(m[0][2]), 0,
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1]), bitcast<u32>(m[1][2]), 0,
          bitcast<u32>(m[2][0]), bitcast<u32>(m[2][1]), bitcast<u32>(m[2][2]), 0
        );
      }

      fn log27_78(_arg_0: mat3x3f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 27;

        var serializedData0 = mat3x3f_79(_arg_0);
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

      fn mat4x4f_81(m: mat4x4f) -> array<u32,16>{
        return array<u32, 16>(
          bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]), bitcast<u32>(m[0][2]), bitcast<u32>(m[0][3]),
          bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1]), bitcast<u32>(m[1][2]), bitcast<u32>(m[1][3]),
          bitcast<u32>(m[2][0]), bitcast<u32>(m[2][1]), bitcast<u32>(m[2][2]), bitcast<u32>(m[2][3]),
          bitcast<u32>(m[3][0]), bitcast<u32>(m[3][1]), bitcast<u32>(m[3][2]), bitcast<u32>(m[3][3])
        );
      }

      fn log28_80(_arg_0: mat4x4f) {
        var index = atomicAdd(&indexBuffer_32, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_33[index].id = 28;

        var serializedData0 = mat4x4f_81(_arg_0);
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
        log2_35(true);
        log3_37(3.140000104904175);
        log4_39(3.140625);
        log5_41(i32(-2000000000));
        log6_43(3000000000);
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
        log25_75();
        log26_76(mat2x2f(0, 0.25, 0.5, 0.75));
        log27_78(mat3x3f(0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5));
        log28_80(mat4x4f(0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75));
      }

      struct mainCompute_Input_82 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_28(in: mainCompute_Input_82)  {
          if (any(in.id >= sizeUniform_29)) {
            return;
          }
          wrappedCallback_30(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_84: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer_87: atomic<u32>;

      struct SerializedLogData_89 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_88: array<SerializedLogData_89, 32>;

      fn log1_86() {
        var index = atomicAdd(&indexBuffer_87, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_88[index].id = 1;


      }

      fn log2_90() {
        var index = atomicAdd(&indexBuffer_87, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_88[index].id = 2;


      }

      fn wrappedCallback_85(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_86();
        log2_90();
      }

      struct mainCompute_Input_91 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_83(in: mainCompute_Input_91)  {
          if (any(in.id >= sizeUniform_84)) {
            return;
          }
          wrappedCallback_85(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_93: vec3u;

      fn u32_96(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_97: atomic<u32>;

      struct SerializedLogData_99 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_98: array<SerializedLogData_99, 32>;

      fn log1_95(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_97, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_98[index].id = 1;

        var serializedData0 = u32_96(_arg_0);
        dataBuffer_98[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_94(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_95(x);
      }

      struct mainCompute_Input_100 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_92(in: mainCompute_Input_100)  {
          if (any(in.id >= sizeUniform_93)) {
            return;
          }
          wrappedCallback_94(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_102: vec3u;

      fn u32_105(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_106: atomic<u32>;

      struct SerializedLogData_108 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_107: array<SerializedLogData_108, 32>;

      fn log1_104(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_106, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_107[index].id = 1;

        var serializedData0 = u32_105(_arg_0);
        dataBuffer_107[index].serializedData[0] = serializedData0[0];
      }

      @group(0) @binding(3) var<uniform> indexUniform_109: u32;

      fn wrappedCallback_103(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_104(indexUniform_109);
      }

      struct mainCompute_Input_110 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_101(in: mainCompute_Input_110)  {
          if (any(in.id >= sizeUniform_102)) {
            return;
          }
          wrappedCallback_103(in.id.x, in.id.y, in.id.z);
        }

      @group(0) @binding(0) var<uniform> sizeUniform_112: vec3u;

      @group(0) @binding(1) var<uniform> logCountUniform_114: u32;

      fn u32_116(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(2) var<storage, read_write> indexBuffer_117: atomic<u32>;

      struct SerializedLogData_119 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(3) var<storage, read_write> dataBuffer_118: array<SerializedLogData_119, 32>;

      fn log1_115(_arg_0: u32, _arg_1: u32) {
        var index = atomicAdd(&indexBuffer_117, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_118[index].id = 1;

        var serializedData0 = u32_116(_arg_0);
        dataBuffer_118[index].serializedData[0] = serializedData0[0];
        var serializedData1 = u32_116(_arg_1);
        dataBuffer_118[index].serializedData[1] = serializedData1[0];
      }

      fn wrappedCallback_113(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        for (var i = 0u; (i < logCountUniform_114); i++) {
          log1_115((i + 1), logCountUniform_114);
        }
      }

      struct mainCompute_Input_120 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_111(in: mainCompute_Input_120)  {
          if (any(in.id >= sizeUniform_112)) {
            return;
          }
          wrappedCallback_113(in.id.x, in.id.y, in.id.z);
        }

      struct mainVertex_Input_122 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct mainVertex_Output_123 {
        @builtin(position) pos: vec4f,
      }

      @vertex fn mainVertex_121(input: mainVertex_Input_122) -> mainVertex_Output_123 {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5));
        return mainVertex_Output_123(vec4f(positions[input.vertexIndex], 0, 1));
      }

      struct mainFragment_Input_125 {
        @builtin(position) pos: vec4f,
      }

      fn u32_127(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_128: atomic<u32>;

      struct SerializedLogData_130 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_129: array<SerializedLogData_130, 32>;

      fn log1_126(_arg_0: u32, _arg_1: u32) {
        var index = atomicAdd(&indexBuffer_128, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_129[index].id = 1;

        var serializedData0 = u32_127(_arg_0);
        dataBuffer_129[index].serializedData[0] = serializedData0[0];
        var serializedData1 = u32_127(_arg_1);
        dataBuffer_129[index].serializedData[1] = serializedData1[0];
      }

      @fragment fn mainFragment_124(_arg_0: mainFragment_Input_125) -> @location(0) vec4f {
        log1_126(u32(_arg_0.pos.x), u32(_arg_0.pos.y));
        return vec4f(0.7689999938011169, 0.3919999897480011, 1, 1);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_132: vec3u;

      fn u32_135(n: u32) -> array<u32,1>{
        return array<u32, 1>(n);
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_136: atomic<u32>;

      struct SerializedLogData_138 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_137: array<SerializedLogData_138, 32>;

      fn log1_134(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_136, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_137[index].id = 1;

        var serializedData0 = u32_135(_arg_0);
        dataBuffer_137[index].serializedData[0] = serializedData0[0];
      }

      fn log2_139(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_136, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_137[index].id = 2;

        var serializedData0 = u32_135(_arg_0);
        dataBuffer_137[index].serializedData[0] = serializedData0[0];
      }

      fn log3_140(_arg_0: u32) {
        var index = atomicAdd(&indexBuffer_136, 1);
        if (index >= 32) {
          return;
        }
        dataBuffer_137[index].id = 3;

        var serializedData0 = u32_135(_arg_0);
        dataBuffer_137[index].serializedData[0] = serializedData0[0];
      }

      fn wrappedCallback_133(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_134(x);
        log2_139(x);
        log3_140(x);
      }

      struct mainCompute_Input_141 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_131(in: mainCompute_Input_141)  {
          if (any(in.id >= sizeUniform_132)) {
            return;
          }
          wrappedCallback_133(in.id.x, in.id.y, in.id.z);
        }"
    `);
  });
});
