/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('xor dev runner example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'xor-dev-runner',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct vertexMain_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexMain_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertexMain_0(input: vertexMain_Input_2) -> vertexMain_Output_1 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        return vertexMain_Output_1(vec4f(pos[input.vertexIndex], 0, 1), pos[input.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> color_4: vec3f;

      @group(0) @binding(1) var<uniform> aspectRatio_5: f32;

      @group(0) @binding(2) var<uniform> scale_6: f32;

      @group(0) @binding(3) var<uniform> time_7: f32;

      fn mod_8(v: vec3f, a: f32) -> vec3f{
        return fract(v / a) * a;
      }

      fn rotateXZ_9(angle: f32) -> mat3x3f {
        return mat3x3f(vec3f(cos(angle), 0, sin(angle)), vec3f(0, 1, 0), vec3f(-sin(angle), 0, cos(angle)));
      }

      @group(0) @binding(4) var<uniform> shift_10: f32;

      fn safeTanh_11(v: f32) -> f32 {
        return select(tanh(v), sign(v), (abs(v) > 10));
      }

      struct fragmentMain_Input_12 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain_3(_arg_0: fragmentMain_Input_12) -> @location(0) vec4f {
        var icolor = (color_4 * 4);
        var ratio = vec2f(aspectRatio_5, 1);
        var dir = normalize(vec3f((_arg_0.uv * ratio), -1));
        var acc = vec3f();
        var z = 0f;
        for (var l = 0; (l < 30); l++) {
          var p = ((z * dir) - scale_6);
          p.x -= (time_7 + 3);
          p.z -= (time_7 + 3);
          var q = p;
          var prox = p.y;
          for (var i = 40.1; (i > 0.01); i *= 0.2) {
            q = ((i * 0.9) - abs((mod_8(q, (i + i)) - i)));
            var minQ = min(min(q.x, q.y), q.z);
            prox = max(prox, minQ);
            q = (q * rotateXZ_9(shift_10));
          }
          z += prox;
          acc = (acc + ((icolor - safeTanh_11((p.y + 4))) * ((0.1 * prox) / (1 + z))));
        }
        acc = tanh((acc * acc));
        return vec4f(acc, 1);
      }"
    `);
  });
});
