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
      "struct vertexMain_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexMain_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertexMain(input: vertexMain_Input) -> vertexMain_Output {
        var pos = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        return vertexMain_Output(vec4f(pos[input.vertexIndex], 0f, 1f), pos[input.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> aspectRatio: f32;

      @group(0) @binding(1) var<uniform> tunnelDepth: i32;

      @group(0) @binding(2) var<uniform> cameraPos: vec2f;

      @group(0) @binding(3) var<uniform> bigStrips: f32;

      @group(0) @binding(4) var<uniform> time: f32;

      @group(0) @binding(5) var<uniform> dollyZoom: f32;

      @group(0) @binding(6) var<uniform> smallStrips: f32;

      @group(0) @binding(7) var<uniform> color: vec3f;

      fn safeTanh(v: vec3f) -> vec3f {
        return select(tanh(v), sign(v), (abs(v) > vec3f(10)));
      }

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(_arg_0: fragmentMain_Input) -> @location(0) vec4f {
        var ratio = vec2f(aspectRatio, 1f);
        var dir = normalize(vec3f((_arg_0.uv * ratio), -1f));
        var z = 0f;
        var acc = vec3f();
        for (var i = 0; (i < tunnelDepth); i++) {
          var p = (dir * z);
          p.x += cameraPos.x;
          p.y += cameraPos.y;
          var coords = vec3f(((atan2(p.y, p.x) * bigStrips) + time), ((p.z * dollyZoom) - (5f * time)), (length(p.xy) - 11f));
          var coords2 = (cos((coords + cos((coords * smallStrips)))) - 1);
          let dd = ((length(vec4f(coords.z, coords2)) * 0.5f) - 0.1f);
          acc = (acc + ((1.2 - cos((color * p.z))) / dd));
          z += dd;
        }
        acc = safeTanh((acc * 5e-3));
        return vec4f(acc, 1f);
      }"
    `);
  });
});
