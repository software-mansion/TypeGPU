/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('react/confetti example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        name: 'confetti',
        category: 'react',
        setupMocks: mockResizeObserver,
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct ParticleData {
        position: vec2f,
        velocity: vec2f,
        seed: f32,
      }

      @group(1) @binding(2) var<storage, read_write> particleData: array<ParticleData>;

      @group(1) @binding(0) var<uniform> time: f32;

      @group(1) @binding(1) var<uniform> deltaTime: f32;

      fn simulate(idx: u32, _arg_1: u32, _arg_2: u32) {
        let particleData_1 = (&particleData[idx]);
        let phase = ((time / 300f) + (*particleData_1).seed);
        (*particleData_1).position += ((((*particleData_1).velocity * deltaTime) / 20f) + vec2f((sin(phase) / 600f), (cos(phase) / 500f)));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input) {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        simulate(in.id.x, in.id.y, in.id.z);
      }

      fn rotate(v: vec2f, angle: f32) -> vec2f {
        var pos = vec2f(((v.x * cos(angle)) - (v.y * sin(angle))), ((v.x * sin(angle)) + (v.y * cos(angle))));
        return pos;
      }

      @group(0) @binding(1) var<uniform> aspectRatio: f32;

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      struct VertexIn {
        @location(0) tilt: f32,
        @builtin(vertex_index) vertexIndex: u32,
        @location(1) angle: f32,
        @location(2) center: vec2f,
        @location(3) color: vec4f,
      }

      @vertex fn vertexShader(input: VertexIn) -> VertexOut {
        let width = input.tilt;
        let height = (input.tilt / 2f);
        var verts = array<vec2f, 4>(vec2f(), vec2f(width, 0f), vec2f(0f, height), vec2f(width, height));
        var pos = (rotate((verts[input.vertexIndex] / 350f), input.angle) + input.center);
        if ((aspectRatio < 1f)) {
          pos.x /= aspectRatio;
        }
        else {
          pos.y *= aspectRatio;
        }
        return VertexOut(vec4f(pos, 0f, 1f), input.color);
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
