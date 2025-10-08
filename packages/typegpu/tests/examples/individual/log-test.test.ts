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
        'Render pipeline',
        'Too many logs',
      ],
      expectedCalls: 11,
    }, device);

    // the resolution variant for when 'shader-f16' is not enabled
    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> indexBuffer_2: atomic<u32>;

      struct SerializedLogData_4 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_3: array<SerializedLogData_4, 40>;

      var<private> dataBlockIndex_5: u32;

      var<private> dataByteIndex_6: u32;

      fn nextByteIndex_9() -> u32{
        let i = dataByteIndex_6;
        dataByteIndex_6 = dataByteIndex_6 + 1u;
        return i;
      }

      fn serializeU32_8(n: u32) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_9()] = n;
      }

      fn log1serializer_7(_arg_0: u32) {
        serializeU32_8(_arg_0);
      }

      fn log1_1(_arg_0: u32) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 1;
        dataByteIndex_6 = 0;

        log1serializer_7(_arg_0);
      }

      @compute @workgroup_size(1) fn item_0() {
        log1_1(321);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_2: atomic<u32>;

      struct SerializedLogData_4 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_3: array<SerializedLogData_4, 40>;

      var<private> dataBlockIndex_5: u32;

      var<private> dataByteIndex_6: u32;

      fn nextByteIndex_9() -> u32{
        let i = dataByteIndex_6;
        dataByteIndex_6 = dataByteIndex_6 + 1u;
        return i;
      }

      fn serializeI32_8(n: i32) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_9()] = bitcast<u32>(n);
      }

      fn serializeVec3u_10(v: vec3u) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_9()] = v.x;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_9()] = v.y;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_9()] = v.z;
      }

      fn log1serializer_7(_arg_0: i32, _arg_1: vec3u, _arg_2: i32, _arg_3: i32) {
        serializeI32_8(_arg_0);
        serializeVec3u_10(_arg_1);
        serializeI32_8(_arg_2);
        serializeI32_8(_arg_3);
      }

      fn log1_1(_arg_0: i32, _arg_1: vec3u, _arg_2: i32, _arg_3: i32) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 1;
        dataByteIndex_6 = 0;

        log1serializer_7(_arg_0, _arg_1, _arg_2, _arg_3);
      }

      @compute @workgroup_size(1) fn item_0() {
        log1_1(1, vec3u(2, 3, 4), 5, 6);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_2: atomic<u32>;

      struct SerializedLogData_4 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_3: array<SerializedLogData_4, 40>;

      var<private> dataBlockIndex_5: u32;

      var<private> dataByteIndex_6: u32;

      fn nextByteIndex_9() -> u32{
        let i = dataByteIndex_6;
        dataByteIndex_6 = dataByteIndex_6 + 1u;
        return i;
      }

      fn serializeI32_8(n: i32) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_9()] = bitcast<u32>(n);
      }

      fn log1serializer_7(_arg_0: i32, _arg_1: i32, _arg_2: i32) {
        serializeI32_8(_arg_0);
        serializeI32_8(_arg_1);
        serializeI32_8(_arg_2);
      }

      fn log1_1(_arg_0: i32, _arg_1: i32, _arg_2: i32) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 1;
        dataByteIndex_6 = 0;

        log1serializer_7(_arg_0, _arg_1, _arg_2);
      }

      @compute @workgroup_size(1) fn item_0() {
        log1_1(2, 3, 5);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_2: atomic<u32>;

      struct SerializedLogData_4 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_3: array<SerializedLogData_4, 40>;

      var<private> dataBlockIndex_5: u32;

      var<private> dataByteIndex_6: u32;

      fn log1serializer_7() {

      }

      fn log1_1() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 1;
        dataByteIndex_6 = 0;

        log1serializer_7();
      }

      fn nextByteIndex_11() -> u32{
        let i = dataByteIndex_6;
        dataByteIndex_6 = dataByteIndex_6 + 1u;
        return i;
      }

      fn serializeF32_10(n: f32) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(n);
      }

      fn log2serializer_9(_arg_0: f32) {
        serializeF32_10(_arg_0);
      }

      fn log2_8(_arg_0: f32) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 2;
        dataByteIndex_6 = 0;

        log2serializer_9(_arg_0);
      }

      fn serializeI32_14(n: i32) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(n);
      }

      fn log3serializer_13(_arg_0: i32) {
        serializeI32_14(_arg_0);
      }

      fn log3_12(_arg_0: i32) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 3;
        dataByteIndex_6 = 0;

        log3serializer_13(_arg_0);
      }

      fn serializeU32_17(n: u32) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = n;
      }

      fn log4serializer_16(_arg_0: u32) {
        serializeU32_17(_arg_0);
      }

      fn log4_15(_arg_0: u32) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 4;
        dataByteIndex_6 = 0;

        log4serializer_16(_arg_0);
      }

      fn serializeBool_20(b: bool) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(b);
      }

      fn log5serializer_19(_arg_0: bool) {
        serializeBool_20(_arg_0);
      }

      fn log5_18(_arg_0: bool) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 5;
        dataByteIndex_6 = 0;

        log5serializer_19(_arg_0);
      }

      fn log6serializer_22() {

      }

      fn log6_21() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 6;
        dataByteIndex_6 = 0;

        log6serializer_22();
      }

      fn log7serializer_24() {

      }

      fn log7_23() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 7;
        dataByteIndex_6 = 0;

        log7serializer_24();
      }

      fn serializeVec2f_27(v: vec2f) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.y);
      }

      fn log8serializer_26(_arg_0: vec2f) {
        serializeVec2f_27(_arg_0);
      }

      fn log8_25(_arg_0: vec2f) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 8;
        dataByteIndex_6 = 0;

        log8serializer_26(_arg_0);
      }

      fn serializeVec3f_30(v: vec3f) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.y);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.z);
      }

      fn log9serializer_29(_arg_0: vec3f) {
        serializeVec3f_30(_arg_0);
      }

      fn log9_28(_arg_0: vec3f) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 9;
        dataByteIndex_6 = 0;

        log9serializer_29(_arg_0);
      }

      fn serializeVec4f_33(v: vec4f) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.y);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.z);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.w);
      }

      fn log10serializer_32(_arg_0: vec4f) {
        serializeVec4f_33(_arg_0);
      }

      fn log10_31(_arg_0: vec4f) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 10;
        dataByteIndex_6 = 0;

        log10serializer_32(_arg_0);
      }

      fn log11serializer_35() {

      }

      fn log11_34() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 11;
        dataByteIndex_6 = 0;

        log11serializer_35();
      }

      fn serializeVec2i_38(v: vec2i) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.y);
      }

      fn log12serializer_37(_arg_0: vec2i) {
        serializeVec2i_38(_arg_0);
      }

      fn log12_36(_arg_0: vec2i) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 12;
        dataByteIndex_6 = 0;

        log12serializer_37(_arg_0);
      }

      fn serializeVec3i_41(v: vec3i) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.y);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.z);
      }

      fn log13serializer_40(_arg_0: vec3i) {
        serializeVec3i_41(_arg_0);
      }

      fn log13_39(_arg_0: vec3i) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 13;
        dataByteIndex_6 = 0;

        log13serializer_40(_arg_0);
      }

      fn serializeVec4i_44(v: vec4i) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.y);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.z);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(v.w);
      }

      fn log14serializer_43(_arg_0: vec4i) {
        serializeVec4i_44(_arg_0);
      }

      fn log14_42(_arg_0: vec4i) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 14;
        dataByteIndex_6 = 0;

        log14serializer_43(_arg_0);
      }

      fn log15serializer_46() {

      }

      fn log15_45() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 15;
        dataByteIndex_6 = 0;

        log15serializer_46();
      }

      fn serializeVec2u_49(v: vec2u) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.x;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.y;
      }

      fn log16serializer_48(_arg_0: vec2u) {
        serializeVec2u_49(_arg_0);
      }

      fn log16_47(_arg_0: vec2u) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 16;
        dataByteIndex_6 = 0;

        log16serializer_48(_arg_0);
      }

      fn serializeVec3u_52(v: vec3u) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.x;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.y;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.z;
      }

      fn log17serializer_51(_arg_0: vec3u) {
        serializeVec3u_52(_arg_0);
      }

      fn log17_50(_arg_0: vec3u) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 17;
        dataByteIndex_6 = 0;

        log17serializer_51(_arg_0);
      }

      fn serializeVec4u_55(v: vec4u) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.x;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.y;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.z;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = v.w;
      }

      fn log18serializer_54(_arg_0: vec4u) {
        serializeVec4u_55(_arg_0);
      }

      fn log18_53(_arg_0: vec4u) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 18;
        dataByteIndex_6 = 0;

        log18serializer_54(_arg_0);
      }

      fn log19serializer_57() {

      }

      fn log19_56() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 19;
        dataByteIndex_6 = 0;

        log19serializer_57();
      }

      fn serializeVec2bool_60(v: vec2<bool>) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.y);
      }

      fn log20serializer_59(_arg_0: vec2<bool>) {
        serializeVec2bool_60(_arg_0);
      }

      fn log20_58(_arg_0: vec2<bool>) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 20;
        dataByteIndex_6 = 0;

        log20serializer_59(_arg_0);
      }

      fn serializeVec3bool_63(v: vec3<bool>) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.y);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.z);
      }

      fn log21serializer_62(_arg_0: vec3<bool>) {
        serializeVec3bool_63(_arg_0);
      }

      fn log21_61(_arg_0: vec3<bool>) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 21;
        dataByteIndex_6 = 0;

        log21serializer_62(_arg_0);
      }

      fn serializeVec4bool_66(v: vec4<bool>) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.x);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.y);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.z);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = u32(v.w);
      }

      fn log22serializer_65(_arg_0: vec4<bool>) {
        serializeVec4bool_66(_arg_0);
      }

      fn log22_64(_arg_0: vec4<bool>) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 22;
        dataByteIndex_6 = 0;

        log22serializer_65(_arg_0);
      }

      fn log23serializer_68() {

      }

      fn log23_67() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 23;
        dataByteIndex_6 = 0;

        log23serializer_68();
      }

      fn log24serializer_70() {

      }

      fn log24_69() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 24;
        dataByteIndex_6 = 0;

        log24serializer_70();
      }

      fn serializeMat2x2f_73(m: mat2x2f) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][1]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][1]);
      }

      fn log25serializer_72(_arg_0: mat2x2f) {
        serializeMat2x2f_73(_arg_0);
      }

      fn log25_71(_arg_0: mat2x2f) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 25;
        dataByteIndex_6 = 0;

        log25serializer_72(_arg_0);
      }

      fn serializeMat3x3f_76(m: mat3x3f) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][1]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][2]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = 0u;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][1]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][2]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = 0u;
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[2][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[2][1]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[2][2]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = 0u;
      }

      fn log26serializer_75(_arg_0: mat3x3f) {
        serializeMat3x3f_76(_arg_0);
      }

      fn log26_74(_arg_0: mat3x3f) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 26;
        dataByteIndex_6 = 0;

        log26serializer_75(_arg_0);
      }

      fn serializeMat4x4f_79(m: mat4x4f) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][1]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][2]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[0][3]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][1]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][2]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[1][3]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[2][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[2][1]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[2][2]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[2][3]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[3][0]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[3][1]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[3][2]);
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_11()] = bitcast<u32>(m[3][3]);
      }

      fn log27serializer_78(_arg_0: mat4x4f) {
        serializeMat4x4f_79(_arg_0);
      }

      fn log27_77(_arg_0: mat4x4f) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 27;
        dataByteIndex_6 = 0;

        log27serializer_78(_arg_0);
      }

      fn log28serializer_81() {

      }

      fn log28_80() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 28;
        dataByteIndex_6 = 0;

        log28serializer_81();
      }

      fn log29serializer_83() {

      }

      fn log29_82() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 29;
        dataByteIndex_6 = 0;

        log29serializer_83();
      }

      @compute @workgroup_size(1) fn item_0() {
        log1_1();
        log2_8(3.140000104904175);
        log3_12(i32(-2000000000));
        log4_15(3000000000);
        log5_18(true);
        log6_21();
        log7_23();
        log8_25(vec2f(1.1, -2.2));
        log9_28(vec3f(10.1, -20.2, 30.3));
        log10_31(vec4f(100.1, -200.2, 300.3, -400.4));
        log11_34();
        log12_36(vec2i(-1, -2));
        log13_39(vec3i(-1, -2, -3));
        log14_42(vec4i(-1, -2, -3, -4));
        log15_45();
        log16_47(vec2u(1, 2));
        log17_50(vec3u(1, 2, 3));
        log18_53(vec4u(1, 2, 3, 4));
        log19_56();
        log20_58(vec2<bool>(true, false));
        log21_61(vec3<bool>(true, false, true));
        log22_64(vec4<bool>(true, false, true, false));
        log23_67();
        log24_69();
        log25_71(mat2x2f(0, 0.25, 0.5, 0.75));
        log26_74(mat3x3f(0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5));
        log27_77(mat4x4f(0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75));
        log28_80();
        {
          log29_82();
        }
      }

      struct SimpleStruct_1 {
        vec: vec3u,
        num: u32,
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_3: atomic<u32>;

      struct SerializedLogData_5 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_4: array<SerializedLogData_5, 40>;

      var<private> dataBlockIndex_6: u32;

      var<private> dataByteIndex_7: u32;

      fn nextByteIndex_12() -> u32{
        let i = dataByteIndex_7;
        dataByteIndex_7 = dataByteIndex_7 + 1u;
        return i;
      }

      fn serializeVec3u_11(v: vec3u) {
        dataBuffer_4[dataBlockIndex_6].serializedData[nextByteIndex_12()] = v.x;
        dataBuffer_4[dataBlockIndex_6].serializedData[nextByteIndex_12()] = v.y;
        dataBuffer_4[dataBlockIndex_6].serializedData[nextByteIndex_12()] = v.z;
      }

      fn serializeU32_13(n: u32) {
        dataBuffer_4[dataBlockIndex_6].serializedData[nextByteIndex_12()] = n;
      }

      fn compoundSerializer_10(_arg_0: vec3u, _arg_1: u32) {
        serializeVec3u_11(_arg_0);
        serializeU32_13(_arg_1);
      }

      fn SimpleStructSerializer_9(arg: SimpleStruct_1) {
        compoundSerializer_10(arg.vec, arg.num);
      }

      fn log1serializer_8(_arg_0: SimpleStruct_1) {
        SimpleStructSerializer_9(_arg_0);
      }

      fn log1_2(_arg_0: SimpleStruct_1) {
        dataBlockIndex_6 = atomicAdd(&indexBuffer_3, 1);
        if (dataBlockIndex_6 >= 40) {
          return;
        }
        dataBuffer_4[dataBlockIndex_6].id = 1;
        dataByteIndex_7 = 0;

        log1serializer_8(_arg_0);
      }

      struct ComplexStruct_14 {
        nested: SimpleStruct_1,
        bool: bool,
      }

      fn compoundSerializer_20(_arg_0: vec3u, _arg_1: u32) {
        serializeVec3u_11(_arg_0);
        serializeU32_13(_arg_1);
      }

      fn SimpleStructSerializer_19(arg: SimpleStruct_1) {
        compoundSerializer_20(arg.vec, arg.num);
      }

      fn serializeBool_21(b: bool) {
        dataBuffer_4[dataBlockIndex_6].serializedData[nextByteIndex_12()] = u32(b);
      }

      fn compoundSerializer_18(_arg_0: SimpleStruct_1, _arg_1: bool) {
        SimpleStructSerializer_19(_arg_0);
        serializeBool_21(_arg_1);
      }

      fn ComplexStructSerializer_17(arg: ComplexStruct_14) {
        compoundSerializer_18(arg.nested, arg.bool);
      }

      fn log2serializer_16(_arg_0: ComplexStruct_14) {
        ComplexStructSerializer_17(_arg_0);
      }

      fn log2_15(_arg_0: ComplexStruct_14) {
        dataBlockIndex_6 = atomicAdd(&indexBuffer_3, 1);
        if (dataBlockIndex_6 >= 40) {
          return;
        }
        dataBuffer_4[dataBlockIndex_6].id = 2;
        dataByteIndex_7 = 0;

        log2serializer_16(_arg_0);
      }

      fn arraySerializer_24(arg: array<u32,2>) {
        serializeU32_13(arg[0]);
        serializeU32_13(arg[1]);
      }

      fn log3serializer_23(_arg_0: array<u32,2>) {
        arraySerializer_24(_arg_0);
      }

      fn log3_22(_arg_0: array<u32,2>) {
        dataBlockIndex_6 = atomicAdd(&indexBuffer_3, 1);
        if (dataBlockIndex_6 >= 40) {
          return;
        }
        dataBuffer_4[dataBlockIndex_6].id = 3;
        dataByteIndex_7 = 0;

        log3serializer_23(_arg_0);
      }

      fn arraySerializer_28(arg: array<u32,2>) {
        serializeU32_13(arg[0]);
        serializeU32_13(arg[1]);
      }

      fn arraySerializer_27(arg: array<array<u32,2>,3>) {
        arraySerializer_28(arg[0]);
        arraySerializer_28(arg[1]);
        arraySerializer_28(arg[2]);
      }

      fn log4serializer_26(_arg_0: array<array<u32,2>,3>) {
        arraySerializer_27(_arg_0);
      }

      fn log4_25(_arg_0: array<array<u32,2>,3>) {
        dataBlockIndex_6 = atomicAdd(&indexBuffer_3, 1);
        if (dataBlockIndex_6 >= 40) {
          return;
        }
        dataBuffer_4[dataBlockIndex_6].id = 4;
        dataByteIndex_7 = 0;

        log4serializer_26(_arg_0);
      }

      @compute @workgroup_size(1) fn item_0() {
        var simpleStruct = SimpleStruct_1(vec3u(1, 2, 3), 4);
        log1_2(simpleStruct);
        var complexStruct = ComplexStruct_14(simpleStruct, true);
        log2_15(complexStruct);
        var simpleArray = array<u32, 2>(1, 2);
        log3_22(simpleArray);
        var complexArray = array<array<u32, 2>, 3>(array<u32, 2>(3, 4), array<u32, 2>(5, 6), array<u32, 2>(7, 8));
        log4_25(complexArray);
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer_2: atomic<u32>;

      struct SerializedLogData_4 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_3: array<SerializedLogData_4, 40>;

      var<private> dataBlockIndex_5: u32;

      var<private> dataByteIndex_6: u32;

      fn log1serializer_7() {

      }

      fn log1_1() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 1;
        dataByteIndex_6 = 0;

        log1serializer_7();
      }

      fn log2serializer_9() {

      }

      fn log2_8() {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 2;
        dataByteIndex_6 = 0;

        log2serializer_9();
      }

      @compute @workgroup_size(1) fn item_0() {
        log1_1();
        log2_8();
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

      @group(0) @binding(0) var<storage, read_write> indexBuffer_2: atomic<u32>;

      struct SerializedLogData_4 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer_3: array<SerializedLogData_4, 40>;

      var<private> dataBlockIndex_5: u32;

      var<private> dataByteIndex_6: u32;

      fn nextByteIndex_9() -> u32{
        let i = dataByteIndex_6;
        dataByteIndex_6 = dataByteIndex_6 + 1u;
        return i;
      }

      fn serializeU32_8(n: u32) {
        dataBuffer_3[dataBlockIndex_5].serializedData[nextByteIndex_9()] = n;
      }

      fn log1serializer_7(_arg_0: u32) {
        serializeU32_8(_arg_0);
      }

      fn log1_1(_arg_0: u32) {
        dataBlockIndex_5 = atomicAdd(&indexBuffer_2, 1);
        if (dataBlockIndex_5 >= 40) {
          return;
        }
        dataBuffer_3[dataBlockIndex_5].id = 1;
        dataByteIndex_6 = 0;

        log1serializer_7(_arg_0);
      }

      @group(0) @binding(2) var<uniform> indexUniform_10: u32;

      @compute @workgroup_size(1) fn item_0() {
        log1_1(indexUniform_10);
      }

      @group(0) @binding(0) var<uniform> logCountUniform_1: u32;

      @group(0) @binding(1) var<storage, read_write> indexBuffer_3: atomic<u32>;

      struct SerializedLogData_5 {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer_4: array<SerializedLogData_5, 40>;

      var<private> dataBlockIndex_6: u32;

      var<private> dataByteIndex_7: u32;

      fn nextByteIndex_10() -> u32{
        let i = dataByteIndex_7;
        dataByteIndex_7 = dataByteIndex_7 + 1u;
        return i;
      }

      fn serializeU32_9(n: u32) {
        dataBuffer_4[dataBlockIndex_6].serializedData[nextByteIndex_10()] = n;
      }

      fn log1serializer_8(_arg_0: u32, _arg_1: u32) {
        serializeU32_9(_arg_0);
        serializeU32_9(_arg_1);
      }

      fn log1_2(_arg_0: u32, _arg_1: u32) {
        dataBlockIndex_6 = atomicAdd(&indexBuffer_3, 1);
        if (dataBlockIndex_6 >= 40) {
          return;
        }
        dataBuffer_4[dataBlockIndex_6].id = 1;
        dataByteIndex_7 = 0;

        log1serializer_8(_arg_0, _arg_1);
      }

      @compute @workgroup_size(1) fn item_0() {
        for (var i = 0u; (i < logCountUniform_1); i++) {
          log1_2((i + 1), logCountUniform_1);
        }
      }

      struct mainVertex_Output_1 {
        @builtin(position) pos: vec4f,
      }

      struct mainVertex_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(input: mainVertex_Input_2) -> mainVertex_Output_1 {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5));
        return mainVertex_Output_1(vec4f(positions[input.vertexIndex], 0, 1));
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
