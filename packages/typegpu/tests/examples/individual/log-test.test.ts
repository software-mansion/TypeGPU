/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('console log example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
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
      },
      device,
    );

    // the resolution variant for when 'shader-f16' is not enabled
    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1(321u);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeI32(n: i32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn serializeVec3u(v: vec3u) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.x;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.y;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.z;
      }

      fn log1serializer(_arg_0: i32, _arg_1: vec3u, _arg_2: i32, _arg_3: i32) {
        serializeI32(_arg_0);
        serializeVec3u(_arg_1);
        serializeI32(_arg_2);
        serializeI32(_arg_3);
      }

      fn log1(_arg_0: i32, _arg_1: vec3u, _arg_2: i32, _arg_3: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0, _arg_1, _arg_2, _arg_3);
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1(1i, vec3u(2, 3, 4), 5i, 6i);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeI32(n: i32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn log1serializer(_arg_0: i32, _arg_1: i32, _arg_2: i32) {
        serializeI32(_arg_0);
        serializeI32(_arg_1);
        serializeI32(_arg_2);
      }

      fn log1(_arg_0: i32, _arg_1: i32, _arg_2: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0, _arg_1, _arg_2);
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1(2i, 3i, 5i);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn log1serializer() {

      }

      fn log1() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer();
      }

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeF32(n: f32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn log2serializer(_arg_0: f32) {
        serializeF32(_arg_0);
      }

      fn log2_1(_arg_0: f32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 2;
        dataByteIndex = 0;

        log2serializer(_arg_0);
      }

      fn serializeI32(n: i32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn log3serializer(_arg_0: i32) {
        serializeI32(_arg_0);
      }

      fn log3(_arg_0: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 3;
        dataByteIndex = 0;

        log3serializer(_arg_0);
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log4serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log4(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 4;
        dataByteIndex = 0;

        log4serializer(_arg_0);
      }

      fn serializeBool(b: bool) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(b);
      }

      fn log5serializer(_arg_0: bool) {
        serializeBool(_arg_0);
      }

      fn log5(_arg_0: bool) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 5;
        dataByteIndex = 0;

        log5serializer(_arg_0);
      }

      fn log6serializer() {

      }

      fn log6() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 6;
        dataByteIndex = 0;

        log6serializer();
      }

      fn log7serializer() {

      }

      fn log7() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 7;
        dataByteIndex = 0;

        log7serializer();
      }

      fn serializeVec2f(v: vec2f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
      }

      fn log8serializer(_arg_0: vec2f) {
        serializeVec2f(_arg_0);
      }

      fn log8(_arg_0: vec2f) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 8;
        dataByteIndex = 0;

        log8serializer(_arg_0);
      }

      fn serializeVec3f(v: vec3f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.z);
      }

      fn log9serializer(_arg_0: vec3f) {
        serializeVec3f(_arg_0);
      }

      fn log9(_arg_0: vec3f) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 9;
        dataByteIndex = 0;

        log9serializer(_arg_0);
      }

      fn serializeVec4f(v: vec4f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.z);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.w);
      }

      fn log10serializer(_arg_0: vec4f) {
        serializeVec4f(_arg_0);
      }

      fn log10(_arg_0: vec4f) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 10;
        dataByteIndex = 0;

        log10serializer(_arg_0);
      }

      fn log11serializer() {

      }

      fn log11() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 11;
        dataByteIndex = 0;

        log11serializer();
      }

      fn serializeVec2i(v: vec2i) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
      }

      fn log12serializer(_arg_0: vec2i) {
        serializeVec2i(_arg_0);
      }

      fn log12(_arg_0: vec2i) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 12;
        dataByteIndex = 0;

        log12serializer(_arg_0);
      }

      fn serializeVec3i(v: vec3i) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.z);
      }

      fn log13serializer(_arg_0: vec3i) {
        serializeVec3i(_arg_0);
      }

      fn log13(_arg_0: vec3i) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 13;
        dataByteIndex = 0;

        log13serializer(_arg_0);
      }

      fn serializeVec4i(v: vec4i) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.z);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.w);
      }

      fn log14serializer(_arg_0: vec4i) {
        serializeVec4i(_arg_0);
      }

      fn log14(_arg_0: vec4i) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 14;
        dataByteIndex = 0;

        log14serializer(_arg_0);
      }

      fn log15serializer() {

      }

      fn log15() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 15;
        dataByteIndex = 0;

        log15serializer();
      }

      fn serializeVec2u(v: vec2u) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.x;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.y;
      }

      fn log16serializer(_arg_0: vec2u) {
        serializeVec2u(_arg_0);
      }

      fn log16(_arg_0: vec2u) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 16;
        dataByteIndex = 0;

        log16serializer(_arg_0);
      }

      fn serializeVec3u(v: vec3u) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.x;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.y;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.z;
      }

      fn log17serializer(_arg_0: vec3u) {
        serializeVec3u(_arg_0);
      }

      fn log17(_arg_0: vec3u) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 17;
        dataByteIndex = 0;

        log17serializer(_arg_0);
      }

      fn serializeVec4u(v: vec4u) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.x;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.y;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.z;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.w;
      }

      fn log18serializer(_arg_0: vec4u) {
        serializeVec4u(_arg_0);
      }

      fn log18(_arg_0: vec4u) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 18;
        dataByteIndex = 0;

        log18serializer(_arg_0);
      }

      fn log19serializer() {

      }

      fn log19() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 19;
        dataByteIndex = 0;

        log19serializer();
      }

      fn serializeVec2bool(v: vec2<bool>) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.y);
      }

      fn log20serializer(_arg_0: vec2<bool>) {
        serializeVec2bool(_arg_0);
      }

      fn log20(_arg_0: vec2<bool>) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 20;
        dataByteIndex = 0;

        log20serializer(_arg_0);
      }

      fn serializeVec3bool(v: vec3<bool>) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.z);
      }

      fn log21serializer(_arg_0: vec3<bool>) {
        serializeVec3bool(_arg_0);
      }

      fn log21(_arg_0: vec3<bool>) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 21;
        dataByteIndex = 0;

        log21serializer(_arg_0);
      }

      fn serializeVec4bool(v: vec4<bool>) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.z);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(v.w);
      }

      fn log22serializer(_arg_0: vec4<bool>) {
        serializeVec4bool(_arg_0);
      }

      fn log22(_arg_0: vec4<bool>) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 22;
        dataByteIndex = 0;

        log22serializer(_arg_0);
      }

      fn log23serializer() {

      }

      fn log23() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 23;
        dataByteIndex = 0;

        log23serializer();
      }

      fn log24serializer() {

      }

      fn log24() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 24;
        dataByteIndex = 0;

        log24serializer();
      }

      fn serializeMat2x2f(m: mat2x2f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][1]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][1]);
      }

      fn log25serializer(_arg_0: mat2x2f) {
        serializeMat2x2f(_arg_0);
      }

      fn log25(_arg_0: mat2x2f) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 25;
        dataByteIndex = 0;

        log25serializer(_arg_0);
      }

      fn serializeMat3x3f(m: mat3x3f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][1]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][2]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = 0u;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][1]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][2]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = 0u;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[2][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[2][1]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[2][2]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = 0u;
      }

      fn log26serializer(_arg_0: mat3x3f) {
        serializeMat3x3f(_arg_0);
      }

      fn log26(_arg_0: mat3x3f) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 26;
        dataByteIndex = 0;

        log26serializer(_arg_0);
      }

      fn serializeMat4x4f(m: mat4x4f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][1]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][2]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[0][3]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][1]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][2]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[1][3]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[2][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[2][1]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[2][2]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[2][3]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[3][0]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[3][1]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[3][2]);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(m[3][3]);
      }

      fn log27serializer(_arg_0: mat4x4f) {
        serializeMat4x4f(_arg_0);
      }

      fn log27(_arg_0: mat4x4f) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 27;
        dataByteIndex = 0;

        log27serializer(_arg_0);
      }

      fn log28serializer() {

      }

      fn log28() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 28;
        dataByteIndex = 0;

        log28serializer();
      }

      fn log29serializer() {

      }

      fn log29() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 29;
        dataByteIndex = 0;

        log29serializer();
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1();
        log2_1(3.140000104904175f);
        log3(-2000000000i);
        log4(3000000000u);
        log5(true);
        log6();
        log7();
        log8(vec2f(1.100000023841858, -2.200000047683716));
        log9(vec3f(10.100000381469727, -20.200000762939453, 30.299999237060547));
        log10(vec4f(100.0999984741211, -200.1999969482422, 300.29998779296875, -400.3999938964844));
        log11();
        log12(vec2i(-1, -2));
        log13(vec3i(-1, -2, -3));
        log14(vec4i(-1, -2, -3, -4));
        log15();
        log16(vec2u(1, 2));
        log17(vec3u(1, 2, 3));
        log18(vec4u(1, 2, 3, 4));
        log19();
        log20(vec2<bool>(true, false));
        log21(vec3<bool>(true, false, true));
        log22(vec4<bool>(true, false, true, false));
        log23();
        log24();
        log25(mat2x2f(0, 0.25, 0.5, 0.75));
        log26(mat3x3f(0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5));
        log27(mat4x4f(0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75));
        log28();
        {
          log29();
        }
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct SimpleStruct {
        vec: vec3u,
        num: u32,
      }

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeVec3u(v: vec3u) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.x;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.y;
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.z;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn compoundSerializer(_arg_0: vec3u, _arg_1: u32) {
        serializeVec3u(_arg_0);
        serializeU32(_arg_1);
      }

      fn SimpleStructSerializer(arg: SimpleStruct) {
        compoundSerializer(arg.vec, arg.num);
      }

      fn log1serializer(_arg_0: SimpleStruct) {
        SimpleStructSerializer(_arg_0);
      }

      fn log1(_arg_0: SimpleStruct) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      struct ComplexStruct {
        nested: SimpleStruct,
        bool: bool,
      }

      fn compoundSerializer_2(_arg_0: vec3u, _arg_1: u32) {
        serializeVec3u(_arg_0);
        serializeU32(_arg_1);
      }

      fn SimpleStructSerializer_1(arg: SimpleStruct) {
        compoundSerializer_2(arg.vec, arg.num);
      }

      fn serializeBool(b: bool) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = u32(b);
      }

      fn compoundSerializer_1(_arg_0: SimpleStruct, _arg_1: bool) {
        SimpleStructSerializer_1(_arg_0);
        serializeBool(_arg_1);
      }

      fn ComplexStructSerializer(arg: ComplexStruct) {
        compoundSerializer_1(arg.nested, arg.bool);
      }

      fn log2serializer(_arg_0: ComplexStruct) {
        ComplexStructSerializer(_arg_0);
      }

      fn log2_1(_arg_0: ComplexStruct) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 2;
        dataByteIndex = 0;

        log2serializer(_arg_0);
      }

      fn arraySerializer(arg: array<u32,2>) {
        serializeU32(arg[0]);
        serializeU32(arg[1]);
      }

      fn log3serializer(_arg_0: array<u32,2>) {
        arraySerializer(_arg_0);
      }

      fn log3(_arg_0: array<u32,2>) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 3;
        dataByteIndex = 0;

        log3serializer(_arg_0);
      }

      fn arraySerializer_2(arg: array<u32,2>) {
        serializeU32(arg[0]);
        serializeU32(arg[1]);
      }

      fn arraySerializer_1(arg: array<array<u32,2>,3>) {
        arraySerializer_2(arg[0]);
        arraySerializer_2(arg[1]);
        arraySerializer_2(arg[2]);
      }

      fn log4serializer(_arg_0: array<array<u32,2>,3>) {
        arraySerializer_1(_arg_0);
      }

      fn log4(_arg_0: array<array<u32,2>,3>) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 4;
        dataByteIndex = 0;

        log4serializer(_arg_0);
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        var simpleStruct = SimpleStruct(vec3u(1, 2, 3), 4u);
        log1(simpleStruct);
        var complexStruct = ComplexStruct(simpleStruct, true);
        log2_1(complexStruct);
        var simpleArray = array<u32, 2>(1u, 2u);
        log3(simpleArray);
        var complexArray = array<array<u32, 2>, 3>(array<u32, 2>(3u, 4u), array<u32, 2>(5u, 6u), array<u32, 2>(7u, 8u));
        log4(complexArray);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn log1serializer() {

      }

      fn log1() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer();
      }

      fn log2serializer() {

      }

      fn log2_1() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 2;
        dataByteIndex = 0;

        log2serializer();
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1();
        log2_1();
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      fn wrappedCallback(x: u32, _arg_1: u32, _arg_2: u32) {
        log1(x);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      @group(0) @binding(3) var<uniform> indexUniform: u32;

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1(indexUniform);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<uniform> logCountUniform: u32;

      @group(0) @binding(2) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(3) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32, _arg_1: u32) {
        serializeU32(_arg_0);
        serializeU32(_arg_1);
      }

      fn log1(_arg_0: u32, _arg_1: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0, _arg_1);
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        for (var i = 0u; (i < logCountUniform); i++) {
          log1((i + 1u), logCountUniform);
        }
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeI32(n: i32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn serializeF32(n: f32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn serializeVec4f(v: vec4f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.z);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.w);
      }

      fn log1serializer(_arg_0: i32, _arg_1: f32, _arg_2: vec4f) {
        serializeI32(_arg_0);
        serializeF32(_arg_1);
        serializeVec4f(_arg_2);
      }

      fn log1(_arg_0: i32, _arg_1: f32, _arg_2: vec4f) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0, _arg_1, _arg_2);
      }

      fn serializeVec3f(v: vec3f) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.x);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.y);
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(v.z);
      }

      fn log2serializer(_arg_0: vec3f, _arg_1: vec3f) {
        serializeVec3f(_arg_0);
        serializeVec3f(_arg_1);
      }

      fn log2_1(_arg_0: vec3f, _arg_1: vec3f) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 2;
        dataByteIndex = 0;

        log2serializer(_arg_0, _arg_1);
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1(987i, 1.26f, vec4f(1, 2, 3, 4));
        log2_1(vec3f(1, 2, 3), vec3f(1, 2, 3));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn log1serializer() {

      }

      fn log1() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer();
      }

      fn log2serializer() {

      }

      fn log2_1() {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 2;
        dataByteIndex = 0;

        log2serializer();
      }

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeI32(n: i32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn log3serializer(_arg_0: i32) {
        serializeI32(_arg_0);
      }

      fn log3(_arg_0: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 3;
        dataByteIndex = 0;

        log3serializer(_arg_0);
      }

      fn log4serializer(_arg_0: i32) {
        serializeI32(_arg_0);
      }

      fn log4(_arg_0: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 4;
        dataByteIndex = 0;

        log4serializer(_arg_0);
      }

      fn log5serializer(_arg_0: i32) {
        serializeI32(_arg_0);
      }

      fn log5(_arg_0: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 5;
        dataByteIndex = 0;

        log5serializer(_arg_0);
      }

      fn log6serializer(_arg_0: i32) {
        serializeI32(_arg_0);
      }

      fn log6(_arg_0: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 6;
        dataByteIndex = 0;

        log6serializer(_arg_0);
      }

      fn log7serializer(_arg_0: i32) {
        serializeI32(_arg_0);
      }

      fn log7(_arg_0: i32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 7;
        dataByteIndex = 0;

        log7serializer(_arg_0);
      }

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        log1();
        log2_1();
        log3(1i);
        log4(2i);
        log5(3i);
        log6(4i);
        log7(5i);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      struct mainVertex_Output {
        @builtin(position) pos: vec4f,
      }

      struct mainVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex(input: mainVertex_Input) -> mainVertex_Output {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5), vec2f(0.5, -0.5));
        return mainVertex_Output(vec4f(positions[input.vertexIndex], 0f, 1f));
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeF32(n: f32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn log1serializer(_arg_0: f32, _arg_1: f32) {
        serializeF32(_arg_0);
        serializeF32(_arg_1);
      }

      fn log1(_arg_0: f32, _arg_1: f32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0, _arg_1);
      }

      struct mainFragment_Input {
        @builtin(position) pos: vec4f,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        log1(_arg_0.pos.x, _arg_0.pos.y);
        return vec4f(0.7689999938011169, 0.3919999897480011, 1, 1);
      }

      struct mainVertex_Output {
        @builtin(position) pos: vec4f,
      }

      struct mainVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex(input: mainVertex_Input) -> mainVertex_Output {
        var positions = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5), vec2f(0.5, -0.5));
        return mainVertex_Output(vec4f(positions[input.vertexIndex], 0f, 1f));
      }

      @group(0) @binding(0) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(1) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeF32(n: f32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = bitcast<u32>(n);
      }

      fn log1serializer(_arg_0: f32, _arg_1: f32) {
        serializeF32(_arg_0);
        serializeF32(_arg_1);
      }

      fn log1(_arg_0: f32, _arg_1: f32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0, _arg_1);
      }

      struct mainFragment_Input {
        @builtin(position) pos: vec4f,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        log1(_arg_0.pos.x, _arg_0.pos.y);
        return vec4f(0.7689999938011169, 0.3919999897480011, 1, 1);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 32>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 40>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      fn log2serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log2_1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 2;
        dataByteIndex = 0;

        log2serializer(_arg_0);
      }

      fn log3serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log3(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 40) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 3;
        dataByteIndex = 0;

        log3serializer(_arg_0);
      }

      fn wrappedCallback(x: u32, _arg_1: u32, _arg_2: u32) {
        log1(x);
        log2_1(x);
        log3(x);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
