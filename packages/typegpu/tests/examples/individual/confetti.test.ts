/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('confetti example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'confetti',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct ParticleData_2 {
        position: vec2f,
        velocity: vec2f,
        seed: f32,
      }

      @group(0) @binding(0) var<storage, read_write> particleDataBuffer_1: array<ParticleData_2, 200>;

      struct mainCompute_Input_3 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn mainCompute_0(in: mainCompute_Input_3)  {
        let index = in.gid.x;
        if index == 0 {
          time += deltaTime;
        }
        let phase = (time / 300) + particleDataBuffer_1[index].seed;
        particleDataBuffer_1[index].position += particleDataBuffer_1[index].velocity * deltaTime / 20 + vec2f(sin(phase) / 600, cos(phase) / 500);
      }

      fn rotate_5(v: vec2f, angle: f32) -> vec2f {
        var pos = vec2f(((v.x * cos(angle)) - (v.y * sin(angle))), ((v.x * sin(angle)) + (v.y * cos(angle))));
        return pos;
      }

      struct mainVert_Input_6 {
        @location(0) tilt: f32,
        @location(1) angle: f32,
        @location(2) color: vec4f,
        @location(3) center: vec2f,
        @builtin(vertex_index) index: u32,
      }

      struct mainVert_Output_7 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      @vertex fn mainVert_4(in: mainVert_Input_6) -> mainVert_Output_7 {
        let width = in.tilt;
        let height = in.tilt / 2;

        var pos = rotate_5(array<vec2f, 4>(
          vec2f(0, 0),
          vec2f(width, 0),
          vec2f(0, height),
          vec2f(width, height),
        )[in.index] / 350, in.angle) + in.center;

        if (aspectRatio < 1) {
          pos.x /= aspectRatio;
        } else {
          pos.y *= aspectRatio;
        }

        return mainVert_Output_7(vec4f(pos, 0.0, 1.0), in.color);
      }

      struct mainFrag_Input_9 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      @fragment fn mainFrag_8(in: mainFrag_Input_9) -> @location(0)  vec4f { return in.color; }"
    `);
  });
});
