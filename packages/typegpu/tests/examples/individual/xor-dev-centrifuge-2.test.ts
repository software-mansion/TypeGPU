/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('xor dev centrifuge example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'xor-dev-centrifuge-2',
        expectedCalls: 1,
      },
      device,
    );

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

      struct Params {
        time: f32,
        aspectRatio: f32,
        cameraPos: vec2f,
        tunnelDepth: i32,
        bigStrips: f32,
        smallStrips: f32,
        dollyZoom: f32,
        color: vec3f,
      }

      @group(0) @binding(0) var<uniform> paramsUniform: Params;

      fn safeTanh(v: vec3f) -> vec3f {
        return select(tanh(v), sign(v), (abs(v) > vec3f(10)));
      }

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(_arg_0: fragmentMain_Input) -> @location(0) vec4f {
        let params = (&paramsUniform);
        var ratio = vec2f((*params).aspectRatio, 1f);
        var dir = normalize(vec3f((_arg_0.uv * ratio), -1f));
        var z = 0f;
        var acc = vec3f();
        for (var i = 0; (i < (*params).tunnelDepth); i++) {
          var p = (dir * z);
          p.x += (*params).cameraPos.x;
          p.y += (*params).cameraPos.y;
          var coords = vec3f(((atan2(p.y, p.x) * (*params).bigStrips) + (*params).time), ((p.z * (*params).dollyZoom) - (5f * (*params).time)), (length(p.xy) - 11f));
          var coords2 = (cos((coords + cos((coords * (*params).smallStrips)))) - 1f);
          let dd = ((length(vec4f(coords.z, coords2)) * 0.5f) - 0.1f);
          acc += ((1.2f - cos(((*params).color * p.z))) / dd);
          z += dd;
        }
        acc = safeTanh((acc * 5e-3f));
        return vec4f(acc, 1f);
      }"
    `);
  });
});
