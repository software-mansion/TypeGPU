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
        'Compound types',
        'Two logs',
        'Two threads',
        '100 dispatches',
        'Varying size logs',
        'String interpolation',
        'Different log functionalities',
        'Render pipeline',
        'Draw indexed',
        'Too many logs',
      ],
      expectedCalls: 14,
    }, device);

    // the resolution variant for when 'shader-f16' is not enabled
    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer_4: atomic<u32>;

      struct SerializedLogData_6 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn nextByteIndex_11() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeU32_10(n: u32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = n;
      }

      fn log1serializer_9(_arg_0: u32) {
        serializeU32_10(_arg_0);
      }

      fn log1_3(_arg_0: u32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9(_arg_0);
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(321u);
      }

      struct mainCompute_Input_12 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_12)  {
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

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn nextByteIndex_11() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeI32_10(n: i32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(n);
      }

      fn serializeVec3u_12(v: vec3u) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = v.x;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = v.y;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = v.z;
      }

      fn log1serializer_9(_arg_0: i32, _arg_1: vec3u, _arg_2: i32, _arg_3: i32) {
        serializeI32_10(_arg_0);
        serializeVec3u_12(_arg_1);
        serializeI32_10(_arg_2);
        serializeI32_10(_arg_3);
      }

      fn log1_3(_arg_0: i32, _arg_1: vec3u, _arg_2: i32, _arg_3: i32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9(_arg_0, _arg_1, _arg_2, _arg_3);
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(1i, vec3u(2, 3, 4), 5i, 6i);
      }

      struct mainCompute_Input_13 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_13)  {
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

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn nextByteIndex_11() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeI32_10(n: i32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(n);
      }

      fn log1serializer_9(_arg_0: i32, _arg_1: i32, _arg_2: i32) {
        serializeI32_10(_arg_0);
        serializeI32_10(_arg_1);
        serializeI32_10(_arg_2);
      }

      fn log1_3(_arg_0: i32, _arg_1: i32, _arg_2: i32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9(_arg_0, _arg_1, _arg_2);
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(2i, 3i, 5i);
      }

      struct mainCompute_Input_12 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_12)  {
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

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn log1serializer_9() {

      }

      fn log1_3() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9();
      }

      fn nextByteIndex_13() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeF32_12(n: f32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(n);
      }

      fn log2serializer_11(_arg_0: f32) {
        serializeF32_12(_arg_0);
      }

      fn log2_10(_arg_0: f32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 2;
        dataByteIndex_8 = 0;

        log2serializer_11(_arg_0);
      }

      fn serializeI32_16(n: i32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(n);
      }

      fn log3serializer_15(_arg_0: i32) {
        serializeI32_16(_arg_0);
      }

      fn log3_14(_arg_0: i32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 3;
        dataByteIndex_8 = 0;

        log3serializer_15(_arg_0);
      }

      fn serializeU32_19(n: u32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = n;
      }

      fn log4serializer_18(_arg_0: u32) {
        serializeU32_19(_arg_0);
      }

      fn log4_17(_arg_0: u32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 4;
        dataByteIndex_8 = 0;

        log4serializer_18(_arg_0);
      }

      fn serializeBool_22(b: bool) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(b);
      }

      fn log5serializer_21(_arg_0: bool) {
        serializeBool_22(_arg_0);
      }

      fn log5_20(_arg_0: bool) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 5;
        dataByteIndex_8 = 0;

        log5serializer_21(_arg_0);
      }

      fn log6serializer_24() {

      }

      fn log6_23() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 6;
        dataByteIndex_8 = 0;

        log6serializer_24();
      }

      fn log7serializer_26() {

      }

      fn log7_25() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 7;
        dataByteIndex_8 = 0;

        log7serializer_26();
      }

      fn serializeVec2f_29(v: vec2f) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.y);
      }

      fn log8serializer_28(_arg_0: vec2f) {
        serializeVec2f_29(_arg_0);
      }

      fn log8_27(_arg_0: vec2f) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 8;
        dataByteIndex_8 = 0;

        log8serializer_28(_arg_0);
      }

      fn serializeVec3f_32(v: vec3f) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.y);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.z);
      }

      fn log9serializer_31(_arg_0: vec3f) {
        serializeVec3f_32(_arg_0);
      }

      fn log9_30(_arg_0: vec3f) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 9;
        dataByteIndex_8 = 0;

        log9serializer_31(_arg_0);
      }

      fn serializeVec4f_35(v: vec4f) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.y);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.z);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.w);
      }

      fn log10serializer_34(_arg_0: vec4f) {
        serializeVec4f_35(_arg_0);
      }

      fn log10_33(_arg_0: vec4f) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 10;
        dataByteIndex_8 = 0;

        log10serializer_34(_arg_0);
      }

      fn log11serializer_37() {

      }

      fn log11_36() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 11;
        dataByteIndex_8 = 0;

        log11serializer_37();
      }

      fn serializeVec2i_40(v: vec2i) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.y);
      }

      fn log12serializer_39(_arg_0: vec2i) {
        serializeVec2i_40(_arg_0);
      }

      fn log12_38(_arg_0: vec2i) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 12;
        dataByteIndex_8 = 0;

        log12serializer_39(_arg_0);
      }

      fn serializeVec3i_43(v: vec3i) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.y);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.z);
      }

      fn log13serializer_42(_arg_0: vec3i) {
        serializeVec3i_43(_arg_0);
      }

      fn log13_41(_arg_0: vec3i) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 13;
        dataByteIndex_8 = 0;

        log13serializer_42(_arg_0);
      }

      fn serializeVec4i_46(v: vec4i) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.y);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.z);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(v.w);
      }

      fn log14serializer_45(_arg_0: vec4i) {
        serializeVec4i_46(_arg_0);
      }

      fn log14_44(_arg_0: vec4i) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 14;
        dataByteIndex_8 = 0;

        log14serializer_45(_arg_0);
      }

      fn log15serializer_48() {

      }

      fn log15_47() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 15;
        dataByteIndex_8 = 0;

        log15serializer_48();
      }

      fn serializeVec2u_51(v: vec2u) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.x;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.y;
      }

      fn log16serializer_50(_arg_0: vec2u) {
        serializeVec2u_51(_arg_0);
      }

      fn log16_49(_arg_0: vec2u) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 16;
        dataByteIndex_8 = 0;

        log16serializer_50(_arg_0);
      }

      fn serializeVec3u_54(v: vec3u) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.x;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.y;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.z;
      }

      fn log17serializer_53(_arg_0: vec3u) {
        serializeVec3u_54(_arg_0);
      }

      fn log17_52(_arg_0: vec3u) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 17;
        dataByteIndex_8 = 0;

        log17serializer_53(_arg_0);
      }

      fn serializeVec4u_57(v: vec4u) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.x;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.y;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.z;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = v.w;
      }

      fn log18serializer_56(_arg_0: vec4u) {
        serializeVec4u_57(_arg_0);
      }

      fn log18_55(_arg_0: vec4u) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 18;
        dataByteIndex_8 = 0;

        log18serializer_56(_arg_0);
      }

      fn log19serializer_59() {

      }

      fn log19_58() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 19;
        dataByteIndex_8 = 0;

        log19serializer_59();
      }

      fn serializeVec2bool_62(v: vec2<bool>) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.y);
      }

      fn log20serializer_61(_arg_0: vec2<bool>) {
        serializeVec2bool_62(_arg_0);
      }

      fn log20_60(_arg_0: vec2<bool>) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 20;
        dataByteIndex_8 = 0;

        log20serializer_61(_arg_0);
      }

      fn serializeVec3bool_65(v: vec3<bool>) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.y);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.z);
      }

      fn log21serializer_64(_arg_0: vec3<bool>) {
        serializeVec3bool_65(_arg_0);
      }

      fn log21_63(_arg_0: vec3<bool>) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 21;
        dataByteIndex_8 = 0;

        log21serializer_64(_arg_0);
      }

      fn serializeVec4bool_68(v: vec4<bool>) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.y);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.z);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = u32(v.w);
      }

      fn log22serializer_67(_arg_0: vec4<bool>) {
        serializeVec4bool_68(_arg_0);
      }

      fn log22_66(_arg_0: vec4<bool>) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 22;
        dataByteIndex_8 = 0;

        log22serializer_67(_arg_0);
      }

      fn log23serializer_70() {

      }

      fn log23_69() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 23;
        dataByteIndex_8 = 0;

        log23serializer_70();
      }

      fn log24serializer_72() {

      }

      fn log24_71() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 24;
        dataByteIndex_8 = 0;

        log24serializer_72();
      }

      fn serializeMat2x2f_75(m: mat2x2f) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][1]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][1]);
      }

      fn log25serializer_74(_arg_0: mat2x2f) {
        serializeMat2x2f_75(_arg_0);
      }

      fn log25_73(_arg_0: mat2x2f) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 25;
        dataByteIndex_8 = 0;

        log25serializer_74(_arg_0);
      }

      fn serializeMat3x3f_78(m: mat3x3f) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][1]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][2]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = 0u;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][1]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][2]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = 0u;
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[2][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[2][1]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[2][2]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = 0u;
      }

      fn log26serializer_77(_arg_0: mat3x3f) {
        serializeMat3x3f_78(_arg_0);
      }

      fn log26_76(_arg_0: mat3x3f) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 26;
        dataByteIndex_8 = 0;

        log26serializer_77(_arg_0);
      }

      fn serializeMat4x4f_81(m: mat4x4f) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][1]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][2]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[0][3]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][1]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][2]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[1][3]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[2][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[2][1]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[2][2]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[2][3]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[3][0]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[3][1]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[3][2]);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_13()] = bitcast<u32>(m[3][3]);
      }

      fn log27serializer_80(_arg_0: mat4x4f) {
        serializeMat4x4f_81(_arg_0);
      }

      fn log27_79(_arg_0: mat4x4f) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 27;
        dataByteIndex_8 = 0;

        log27serializer_80(_arg_0);
      }

      fn log28serializer_83() {

      }

      fn log28_82() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 28;
        dataByteIndex_8 = 0;

        log28serializer_83();
      }

      fn log29serializer_85() {

      }

      fn log29_84() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 29;
        dataByteIndex_8 = 0;

        log29serializer_85();
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3();
        log2_10(3.140000104904175f);
        log3_14(i32(-2000000000));
        log4_17(3000000000u);
        log5_20(true);
        log6_23();
        log7_25();
        log8_27(vec2f(1.1f, -2.2));
        log9_30(vec3f(10.1f, -20.2, 30.3f));
        log10_33(vec4f(100.1f, -200.2, 300.3f, -400.4));
        log11_36();
        log12_38(vec2i(-1, -2));
        log13_41(vec3i(-1, -2, -3));
        log14_44(vec4i(-1, -2, -3, -4));
        log15_47();
        log16_49(vec2u(1, 2));
        log17_52(vec3u(1, 2, 3));
        log18_55(vec4u(1, 2, 3, 4));
        log19_58();
        log20_60(vec2<bool>(true, false));
        log21_63(vec3<bool>(true, false, true));
        log22_66(vec4<bool>(true, false, true, false));
        log23_69();
        log24_71();
        log25_73(mat2x2f(0, 0.25, 0.5, 0.75));
        log26_76(mat3x3f(0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5));
        log27_79(mat4x4f(0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75));
        log28_82();
        {
          log29_84();
        }
      }

      struct mainCompute_Input_86 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_86)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      struct SimpleStruct_3 {
        vec: vec3u,
        num: u32,
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 40>;

      var<private> dataBlockIndex_8: u32;

      var<private> dataByteIndex_9: u32;

      fn nextByteIndex_14() -> u32{
        let i = dataByteIndex_9;
        dataByteIndex_9 = dataByteIndex_9 + 1u;
        return i;
      }

      fn serializeVec3u_13(v: vec3u) {
        dataBuffer_6[dataBlockIndex_8].serializedData[nextByteIndex_14()] = v.x;
        dataBuffer_6[dataBlockIndex_8].serializedData[nextByteIndex_14()] = v.y;
        dataBuffer_6[dataBlockIndex_8].serializedData[nextByteIndex_14()] = v.z;
      }

      fn serializeU32_15(n: u32) {
        dataBuffer_6[dataBlockIndex_8].serializedData[nextByteIndex_14()] = n;
      }

      fn compoundSerializer_12(_arg_0: vec3u, _arg_1: u32) {
        serializeVec3u_13(_arg_0);
        serializeU32_15(_arg_1);
      }

      fn SimpleStructSerializer_11(arg: SimpleStruct_3) {
        compoundSerializer_12(arg.vec, arg.num);
      }

      fn log1serializer_10(_arg_0: SimpleStruct_3) {
        SimpleStructSerializer_11(_arg_0);
      }

      fn log1_4(_arg_0: SimpleStruct_3) {
        dataBlockIndex_8 = atomicAdd(&indexBuffer_5, 1);
        if (dataBlockIndex_8 >= 40) {
          return;
        }
        dataBuffer_6[dataBlockIndex_8].id = 1;
        dataByteIndex_9 = 0;

        log1serializer_10(_arg_0);
      }

      struct ComplexStruct_16 {
        nested: SimpleStruct_3,
        bool: bool,
      }

      fn compoundSerializer_22(_arg_0: vec3u, _arg_1: u32) {
        serializeVec3u_13(_arg_0);
        serializeU32_15(_arg_1);
      }

      fn SimpleStructSerializer_21(arg: SimpleStruct_3) {
        compoundSerializer_22(arg.vec, arg.num);
      }

      fn serializeBool_23(b: bool) {
        dataBuffer_6[dataBlockIndex_8].serializedData[nextByteIndex_14()] = u32(b);
      }

      fn compoundSerializer_20(_arg_0: SimpleStruct_3, _arg_1: bool) {
        SimpleStructSerializer_21(_arg_0);
        serializeBool_23(_arg_1);
      }

      fn ComplexStructSerializer_19(arg: ComplexStruct_16) {
        compoundSerializer_20(arg.nested, arg.bool);
      }

      fn log2serializer_18(_arg_0: ComplexStruct_16) {
        ComplexStructSerializer_19(_arg_0);
      }

      fn log2_17(_arg_0: ComplexStruct_16) {
        dataBlockIndex_8 = atomicAdd(&indexBuffer_5, 1);
        if (dataBlockIndex_8 >= 40) {
          return;
        }
        dataBuffer_6[dataBlockIndex_8].id = 2;
        dataByteIndex_9 = 0;

        log2serializer_18(_arg_0);
      }

      fn arraySerializer_26(arg: array<u32,2>) {
        serializeU32_15(arg[0]);
        serializeU32_15(arg[1]);
      }

      fn log3serializer_25(_arg_0: array<u32,2>) {
        arraySerializer_26(_arg_0);
      }

      fn log3_24(_arg_0: array<u32,2>) {
        dataBlockIndex_8 = atomicAdd(&indexBuffer_5, 1);
        if (dataBlockIndex_8 >= 40) {
          return;
        }
        dataBuffer_6[dataBlockIndex_8].id = 3;
        dataByteIndex_9 = 0;

        log3serializer_25(_arg_0);
      }

      fn arraySerializer_30(arg: array<u32,2>) {
        serializeU32_15(arg[0]);
        serializeU32_15(arg[1]);
      }

      fn arraySerializer_29(arg: array<array<u32,2>,3>) {
        arraySerializer_30(arg[0]);
        arraySerializer_30(arg[1]);
        arraySerializer_30(arg[2]);
      }

      fn log4serializer_28(_arg_0: array<array<u32,2>,3>) {
        arraySerializer_29(_arg_0);
      }

      fn log4_27(_arg_0: array<array<u32,2>,3>) {
        dataBlockIndex_8 = atomicAdd(&indexBuffer_5, 1);
        if (dataBlockIndex_8 >= 40) {
          return;
        }
        dataBuffer_6[dataBlockIndex_8].id = 4;
        dataByteIndex_9 = 0;

        log4serializer_28(_arg_0);
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        var simpleStruct = SimpleStruct_3(vec3u(1, 2, 3), 4u);
        log1_4(simpleStruct);
        var complexStruct = ComplexStruct_16(simpleStruct, true);
        log2_17(complexStruct);
        var simpleArray = array<u32, 2>(1u, 2u);
        log3_24(simpleArray);
        var complexArray = array<array<u32, 2>, 3>(array<u32, 2>(3u, 4u), array<u32, 2>(5u, 6u), array<u32, 2>(7u, 8u));
        log4_27(complexArray);
      }

      struct mainCompute_Input_31 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_31)  {
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

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn log1serializer_9() {

      }

      fn log1_3() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9();
      }

      fn log2serializer_11() {

      }

      fn log2_10() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 2;
        dataByteIndex_8 = 0;

        log2serializer_11();
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3();
        log2_10();
      }

      struct mainCompute_Input_12 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_12)  {
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

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn nextByteIndex_11() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeU32_10(n: u32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = n;
      }

      fn log1serializer_9(_arg_0: u32) {
        serializeU32_10(_arg_0);
      }

      fn log1_3(_arg_0: u32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9(_arg_0);
      }

      fn wrappedCallback_2(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(x);
      }

      struct mainCompute_Input_12 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_12)  {
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

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn nextByteIndex_11() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeU32_10(n: u32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = n;
      }

      fn log1serializer_9(_arg_0: u32) {
        serializeU32_10(_arg_0);
      }

      fn log1_3(_arg_0: u32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9(_arg_0);
      }

      @group(0) @binding(3) var<uniform> indexUniform_12: u32;

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(indexUniform_12);
      }

      struct mainCompute_Input_13 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_13)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<uniform> logCountUniform_3: u32;

      @group(0) @binding(2) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(3) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 40>;

      var<private> dataBlockIndex_8: u32;

      var<private> dataByteIndex_9: u32;

      fn nextByteIndex_12() -> u32{
        let i = dataByteIndex_9;
        dataByteIndex_9 = dataByteIndex_9 + 1u;
        return i;
      }

      fn serializeU32_11(n: u32) {
        dataBuffer_6[dataBlockIndex_8].serializedData[nextByteIndex_12()] = n;
      }

      fn log1serializer_10(_arg_0: u32, _arg_1: u32) {
        serializeU32_11(_arg_0);
        serializeU32_11(_arg_1);
      }

      fn log1_4(_arg_0: u32, _arg_1: u32) {
        dataBlockIndex_8 = atomicAdd(&indexBuffer_5, 1);
        if (dataBlockIndex_8 >= 40) {
          return;
        }
        dataBuffer_6[dataBlockIndex_8].id = 1;
        dataByteIndex_9 = 0;

        log1serializer_10(_arg_0, _arg_1);
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        for (var i = 0u; (i < logCountUniform_3); i++) {
          log1_4((i + 1u), logCountUniform_3);
        }
      }

      struct mainCompute_Input_13 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_13)  {
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

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn nextByteIndex_11() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeI32_10(n: i32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(n);
      }

      fn serializeF32_12(n: f32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(n);
      }

      fn serializeVec4f_13(v: vec4f) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(v.y);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(v.z);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(v.w);
      }

      fn log1serializer_9(_arg_0: i32, _arg_1: f32, _arg_2: vec4f) {
        serializeI32_10(_arg_0);
        serializeF32_12(_arg_1);
        serializeVec4f_13(_arg_2);
      }

      fn log1_3(_arg_0: i32, _arg_1: f32, _arg_2: vec4f) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9(_arg_0, _arg_1, _arg_2);
      }

      fn serializeVec3f_16(v: vec3f) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(v.x);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(v.y);
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = bitcast<u32>(v.z);
      }

      fn log2serializer_15(_arg_0: vec3f, _arg_1: vec3f) {
        serializeVec3f_16(_arg_0);
        serializeVec3f_16(_arg_1);
      }

      fn log2_14(_arg_0: vec3f, _arg_1: vec3f) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 2;
        dataByteIndex_8 = 0;

        log2serializer_15(_arg_0, _arg_1);
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(987i, 1.26f, vec4f(1, 2, 3, 4));
        log2_14(vec3f(1, 2, 3), vec3f(1, 2, 3));
      }

      struct mainCompute_Input_17 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_17)  {
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

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn log1serializer_9() {

      }

      fn log1_3() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9();
      }

      fn log2serializer_11() {

      }

      fn log2_10() {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 2;
        dataByteIndex_8 = 0;

        log2serializer_11();
      }

      fn nextByteIndex_15() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeI32_14(n: i32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_15()] = bitcast<u32>(n);
      }

      fn log3serializer_13(_arg_0: i32) {
        serializeI32_14(_arg_0);
      }

      fn log3_12(_arg_0: i32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 3;
        dataByteIndex_8 = 0;

        log3serializer_13(_arg_0);
      }

      fn log4serializer_17(_arg_0: i32) {
        serializeI32_14(_arg_0);
      }

      fn log4_16(_arg_0: i32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 4;
        dataByteIndex_8 = 0;

        log4serializer_17(_arg_0);
      }

      fn log5serializer_19(_arg_0: i32) {
        serializeI32_14(_arg_0);
      }

      fn log5_18(_arg_0: i32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 5;
        dataByteIndex_8 = 0;

        log5serializer_19(_arg_0);
      }

      fn log6serializer_21(_arg_0: i32) {
        serializeI32_14(_arg_0);
      }

      fn log6_20(_arg_0: i32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 6;
        dataByteIndex_8 = 0;

        log6serializer_21(_arg_0);
      }

      fn log7serializer_23(_arg_0: i32) {
        serializeI32_14(_arg_0);
      }

      fn log7_22(_arg_0: i32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 7;
        dataByteIndex_8 = 0;

        log7serializer_23(_arg_0);
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1_3();
        log2_10();
        log3_12(1i);
        log4_16(2i);
        log5_18(3i);
        log6_20(4i);
        log7_22(5i);
      }

      struct mainCompute_Input_24 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_24)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }

      struct mainVertex_Output_1 {
        @builtin(position) pos: vec4f,
      }

      struct mainVertex_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(input: mainVertex_Input_2) -> mainVertex_Output_1 {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5f, -0.5));
        return mainVertex_Output_1(vec4f(positions[input.vertexIndex], 0f, 1f));
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 40>;

      var<private> dataBlockIndex_8: u32;

      var<private> dataByteIndex_9: u32;

      fn nextByteIndex_12() -> u32{
        let i = dataByteIndex_9;
        dataByteIndex_9 = dataByteIndex_9 + 1u;
        return i;
      }

      fn serializeF32_11(n: f32) {
        dataBuffer_6[dataBlockIndex_8].serializedData[nextByteIndex_12()] = bitcast<u32>(n);
      }

      fn log1serializer_10(_arg_0: f32, _arg_1: f32) {
        serializeF32_11(_arg_0);
        serializeF32_11(_arg_1);
      }

      fn log1_4(_arg_0: f32, _arg_1: f32) {
        dataBlockIndex_8 = atomicAdd(&indexBuffer_5, 1);
        if (dataBlockIndex_8 >= 40) {
          return;
        }
        dataBuffer_6[dataBlockIndex_8].id = 1;
        dataByteIndex_9 = 0;

        log1serializer_10(_arg_0, _arg_1);
      }

      struct mainFragment_Input_13 {
        @builtin(position) pos: vec4f,
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_13) -> @location(0) vec4f {
        log1_4(_arg_0.pos.x, _arg_0.pos.y);
        return vec4f(0.7689999938011169, 0.3919999897480011, 1, 1);
      }

      struct mainVertex_Output_1 {
        @builtin(position) pos: vec4f,
      }

      struct mainVertex_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(input: mainVertex_Input_2) -> mainVertex_Output_1 {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5f, -0.5));
        return mainVertex_Output_1(vec4f(positions[input.vertexIndex], 0f, 1f));
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_5: atomic<u32>;

      struct SerializedLogData_7 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_6: array<SerializedLogData_7, 40>;

      var<private> dataBlockIndex_8: u32;

      var<private> dataByteIndex_9: u32;

      fn nextByteIndex_12() -> u32{
        let i = dataByteIndex_9;
        dataByteIndex_9 = dataByteIndex_9 + 1u;
        return i;
      }

      fn serializeF32_11(n: f32) {
        dataBuffer_6[dataBlockIndex_8].serializedData[nextByteIndex_12()] = bitcast<u32>(n);
      }

      fn log1serializer_10(_arg_0: f32, _arg_1: f32) {
        serializeF32_11(_arg_0);
        serializeF32_11(_arg_1);
      }

      fn log1_4(_arg_0: f32, _arg_1: f32) {
        dataBlockIndex_8 = atomicAdd(&indexBuffer_5, 1);
        if (dataBlockIndex_8 >= 40) {
          return;
        }
        dataBuffer_6[dataBlockIndex_8].id = 1;
        dataByteIndex_9 = 0;

        log1serializer_10(_arg_0, _arg_1);
      }

      struct mainFragment_Input_13 {
        @builtin(position) pos: vec4f,
      }

      @fragment fn mainFragment_3(_arg_0: mainFragment_Input_13) -> @location(0) vec4f {
        log1_4(_arg_0.pos.x, _arg_0.pos.y);
        return vec4f(0.7689999938011169, 0.3919999897480011, 1, 1);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer_4: atomic<u32>;

      struct SerializedLogData_6 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_5: array<SerializedLogData_6, 40>;

      var<private> dataBlockIndex_7: u32;

      var<private> dataByteIndex_8: u32;

      fn nextByteIndex_11() -> u32{
        let i = dataByteIndex_8;
        dataByteIndex_8 = dataByteIndex_8 + 1u;
        return i;
      }

      fn serializeU32_10(n: u32) {
        dataBuffer_5[dataBlockIndex_7].serializedData[nextByteIndex_11()] = n;
      }

      fn log1serializer_9(_arg_0: u32) {
        serializeU32_10(_arg_0);
      }

      fn log1_3(_arg_0: u32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 1;
        dataByteIndex_8 = 0;

        log1serializer_9(_arg_0);
      }

      fn log2serializer_13(_arg_0: u32) {
        serializeU32_10(_arg_0);
      }

      fn log2_12(_arg_0: u32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 2;
        dataByteIndex_8 = 0;

        log2serializer_13(_arg_0);
      }

      fn log3serializer_15(_arg_0: u32) {
        serializeU32_10(_arg_0);
      }

      fn log3_14(_arg_0: u32) {
        dataBlockIndex_7 = atomicAdd(&indexBuffer_4, 1);
        if (dataBlockIndex_7 >= 40) {
          return;
        }
        dataBuffer_5[dataBlockIndex_7].id = 3;
        dataByteIndex_8 = 0;

        log3serializer_15(_arg_0);
      }

      fn wrappedCallback_2(x: u32, _arg_1: u32, _arg_2: u32) {
        log1_3(x);
        log2_12(x);
        log3_14(x);
      }

      struct mainCompute_Input_16 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_16)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
