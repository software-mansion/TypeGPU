/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('xor dev centrifuge example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'xor-dev-centrifuge-2',
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
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3f, -1), vec2f(-1, 3f));
        return vertexMain_Output_1(vec4f(pos[input.vertexIndex], 0f, 1f), pos[input.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> aspectRatio_4: f32;

      @group(0) @binding(1) var<uniform> tunnelDepth_5: i32;

      @group(0) @binding(2) var<uniform> cameraPos_6: vec2f;

      @group(0) @binding(3) var<uniform> bigStrips_7: f32;

      @group(0) @binding(4) var<uniform> time_8: f32;

      @group(0) @binding(5) var<uniform> dollyZoom_9: f32;

      @group(0) @binding(6) var<uniform> smallStrips_10: f32;

      @group(0) @binding(7) var<uniform> color_11: vec3f;

      fn safeTanh_12(v: vec3f) -> vec3f {
        return select(tanh(v), sign(v), (abs(v) > vec3f(10)));
      }

      struct fragmentMain_Input_13 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain_3(_arg_0: fragmentMain_Input_13) -> @location(0) vec4f {
        var ratio = vec2f(aspectRatio_4, 1f);
        var dir = normalize(vec3f((_arg_0.uv * ratio), -1));
        var z = 0f;
        var acc = vec3f();
        for (var i = 0; (i < tunnelDepth_5); i++) {
          var p = (dir * z);
          p.x += cameraPos_6.x;
          p.y += cameraPos_6.y;
          var coords = vec3f(((atan2(p.y, p.x) * bigStrips_7) + time_8), ((p.z * dollyZoom_9) - (5f * time_8)), (length(p.xy) - 11f));
          var coords2 = (cos((coords + cos((coords * smallStrips_10)))) - 1);
          var dd = ((length(vec4f(coords.z, coords2)) * 0.5f) - 0.1f);
          acc = (acc + ((1.2 - cos((color_11 * p.z))) / dd));
          z += dd;
        }
        acc = safeTanh_12((acc * 5e-3));
        return vec4f(acc, 1f);
      }"
    `);
  });
});
