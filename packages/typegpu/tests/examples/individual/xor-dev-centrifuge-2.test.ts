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
      waitForAsync: true,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct vertexMain_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct vertexMain_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertexMain_0(input: vertexMain_Input_1) -> vertexMain_Output_2 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        return vertexMain_Output_2(vec4f(pos[input.vertexIndex], 0, 1), pos[input.vertexIndex]);
      }

      struct fragmentMain_Input_4 {
        @location(0) uv: vec2f,
      }

      @group(0) @binding(0) var<uniform> aspectRatio_5: f32;

      @group(0) @binding(1) var<uniform> tunnelDepth_6: i32;

      @group(0) @binding(2) var<uniform> cameraPos_7: vec2f;

      @group(0) @binding(3) var<uniform> bigStrips_8: f32;

      @group(0) @binding(4) var<uniform> time_9: f32;

      @group(0) @binding(5) var<uniform> dollyZoom_10: f32;

      @group(0) @binding(6) var<uniform> smallStrips_11: f32;

      @group(0) @binding(7) var<uniform> color_12: vec3f;

      fn safeTanh3_13(v: vec3f) -> vec3f {
        return select(tanh(v), sign(v), (abs(v) > vec3f(10)));
      }

      @fragment fn fragmentMain_3(_arg_0: fragmentMain_Input_4) -> @location(0) vec4f {
        var ratio = vec2f(aspectRatio_5, 1);
        var dir = normalize(vec3f((_arg_0.uv * ratio), -1));
        var z = 0f;
        var acc = vec3f();
        for (var i = 0; (i < tunnelDepth_6); i++) {
          var p = (z * dir);
          p.x += cameraPos_7.x;
          p.y += cameraPos_7.y;
          var coords = vec3f(((atan2(p.y, p.x) * bigStrips_8) + time_9), ((p.z * dollyZoom_10) - (5 * time_9)), (length(p.xy) - 11));
          var coords2 = (cos((coords + cos((coords * smallStrips_11)))) - 1);
          var dd = ((length(vec4f(coords.z, coords2)) * 0.5) - 0.1);
          acc = (acc + ((1.2 - cos((p.z * color_12))) * (1f / dd)));
          z += dd;
        }
        acc = safeTanh3_13((acc * 5e-3));
        return vec4f(acc, 1);
      }"
    `);
  });
});
