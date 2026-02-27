/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('ascii filter example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'image-processing',
      name: 'ascii-filter',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> uvTransformBuffer: mat2x2f;

      @group(1) @binding(0) var externalTexture: texture_external;

      @group(0) @binding(1) var<uniform> glyphSize: u32;

      @group(0) @binding(2) var shaderSampler: sampler;

      @group(0) @binding(3) var<uniform> gammaCorrection: f32;

      @group(0) @binding(4) var<uniform> charsetExtended: u32;

      fn characterFn(n: u32, p: vec2f) -> f32 {
        var pos = floor(((p * vec2f(-4, 4)) + 2.5f));
        if (((((pos.x < 0f) || (pos.x > 4f)) || (pos.y < 0f)) || (pos.y > 4f))) {
          return 0f;
        }
        let a = u32((pos.x + (5f * pos.y)));
        return f32(((n >> a) & 1u));
      }

      @group(0) @binding(5) var<uniform> displayMode: u32;

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        var uv2 = ((uvTransformBuffer * (_arg_0.uv - 0.5f)) + 0.5f);
        var textureSize = vec2f(textureDimensions(externalTexture));
        var pix = (uv2 * textureSize);
        let cellSize = f32(glyphSize);
        let halfCell = (cellSize * 0.5f);
        var blockCoord = ((floor((pix / cellSize)) * cellSize) / textureSize);
        var color = textureSampleBaseClampToEdge(externalTexture, shaderSampler, blockCoord);
        let rawGray = (((0.3f * color.x) + (0.59f * color.y)) + (0.11f * color.z));
        let gray = pow(rawGray, gammaCorrection);
        var n = 4096u;
        if ((charsetExtended == 0u)) {
          if ((gray > 0.2f)) {
            n = 65600u;
          }
          if ((gray > 0.3f)) {
            n = 163153u;
          }
          if ((gray > 0.4f)) {
            n = 15255086u;
          }
          if ((gray > 0.5f)) {
            n = 13121101u;
          }
          if ((gray > 0.6f)) {
            n = 15252014u;
          }
          if ((gray > 0.7f)) {
            n = 13195790u;
          }
          if ((gray > 0.8f)) {
            n = 11512810u;
          }
        }
        else {
          if ((gray > 0.0233f)) {
            n = 4096u;
          }
          if ((gray > 0.0465f)) {
            n = 131200u;
          }
          if ((gray > 0.0698f)) {
            n = 4329476u;
          }
          if ((gray > 0.093f)) {
            n = 459200u;
          }
          if ((gray > 0.1163f)) {
            n = 4591748u;
          }
          if ((gray > 0.1395f)) {
            n = 12652620u;
          }
          if ((gray > 0.1628f)) {
            n = 14749828u;
          }
          if ((gray > 0.186f)) {
            n = 18393220u;
          }
          if ((gray > 0.2093f)) {
            n = 15239300u;
          }
          if ((gray > 0.2326f)) {
            n = 17318431u;
          }
          if ((gray > 0.2558f)) {
            n = 32641156u;
          }
          if ((gray > 0.2791f)) {
            n = 18393412u;
          }
          if ((gray > 0.3023f)) {
            n = 18157905u;
          }
          if ((gray > 0.3256f)) {
            n = 17463428u;
          }
          if ((gray > 0.3488f)) {
            n = 14954572u;
          }
          if ((gray > 0.3721f)) {
            n = 13177118u;
          }
          if ((gray > 0.3953f)) {
            n = 6566222u;
          }
          if ((gray > 0.4186f)) {
            n = 16269839u;
          }
          if ((gray > 0.4419f)) {
            n = 18444881u;
          }
          if ((gray > 0.4651f)) {
            n = 18400814u;
          }
          if ((gray > 0.4884f)) {
            n = 33061392u;
          }
          if ((gray > 0.5116f)) {
            n = 15255086u;
          }
          if ((gray > 0.5349f)) {
            n = 32045584u;
          }
          if ((gray > 0.5581f)) {
            n = 18405034u;
          }
          if ((gray > 0.5814f)) {
            n = 15022158u;
          }
          if ((gray > 0.6047f)) {
            n = 15018318u;
          }
          if ((gray > 0.6279f)) {
            n = 16272942u;
          }
          if ((gray > 0.6512f)) {
            n = 18415153u;
          }
          if ((gray > 0.6744f)) {
            n = 32641183u;
          }
          if ((gray > 0.6977f)) {
            n = 32540207u;
          }
          if ((gray > 0.7209f)) {
            n = 18732593u;
          }
          if ((gray > 0.7442f)) {
            n = 18667121u;
          }
          if ((gray > 0.7674f)) {
            n = 16267326u;
          }
          if ((gray > 0.7907f)) {
            n = 32575775u;
          }
          if ((gray > 0.814f)) {
            n = 15022414u;
          }
          if ((gray > 0.8372f)) {
            n = 15255537u;
          }
          if ((gray > 0.8605f)) {
            n = 32032318u;
          }
          if ((gray > 0.8837f)) {
            n = 32045617u;
          }
          if ((gray > 0.907f)) {
            n = 33081316u;
          }
          if ((gray > 0.9302f)) {
            n = 32045630u;
          }
          if ((gray > 0.9535f)) {
            n = 33061407u;
          }
          if ((gray > 0.9767f)) {
            n = 11512810u;
          }
        }
        var p = vec2f((((pix.x / halfCell) % 2f) - 1f), (((pix.y / halfCell) % 2f) - 1f));
        let charValue = characterFn(n, p);
        var resultColor = vec3f(1);
        if ((displayMode == 0u)) {
          resultColor = (color.rgb * charValue);
        }
        if ((displayMode == 1u)) {
          resultColor = vec3f((gray * charValue));
        }
        if ((displayMode == 2u)) {
          resultColor = vec3f(charValue);
        }
        return vec4f(resultColor, 1f);
      }"
    `);
  });
});
