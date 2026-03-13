/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('confetti example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simulation',
        name: 'confetti',
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<uniform> time: f32;

      struct ParticleData {
        position: vec2f,
        velocity: vec2f,
        seed: f32,
      }

      @group(0) @binding(2) var<storage, read_write> particleDataBuffer: array<ParticleData, 200>;

      @group(0) @binding(3) var<uniform> deltaTime: f32;

      fn wrappedCallback(index: u32, _arg_1: u32, _arg_2: u32) {
        let phase = ((time / 300f) + particleDataBuffer[index].seed);
        particleDataBuffer[index].position += (((particleDataBuffer[index].velocity * deltaTime) / 20f) + vec2f((sin(phase) / 600f), (cos(phase) / 500f)));
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

      fn rotate(v: vec2f, angle: f32) -> vec2f {
        return vec2f(((v.x * cos(angle)) - (v.y * sin(angle))), ((v.x * sin(angle)) + (v.y * cos(angle))));
      }

      @group(0) @binding(0) var<uniform> aspectRatio: f32;

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      struct VertexIn {
        @location(0) tilt: f32,
        @location(1) angle: f32,
        @location(2) color: vec4f,
        @location(3) center: vec2f,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        let width = (_arg_0.tilt / 350f);
        let height = (width / 2f);
        var local = array<vec2f, 4>(vec2f(), vec2f(width, 0f), vec2f(0f, height), vec2f(width, height));
        var pos = (rotate(local[_arg_0.vertexIndex], _arg_0.angle) + _arg_0.center);
        if ((aspectRatio < 1f)) {
          pos.x /= aspectRatio;
        }
        else {
          pos.y *= aspectRatio;
        }
        return VertexOut(vec4f(pos, 0f, 1f), _arg_0.color);
      }

      struct FragmentIn {
        @location(0) color: vec4f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        return _arg_0.color;
      }"
    `);
  });
});
